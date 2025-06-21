document.addEventListener('DOMContentLoaded', () => {
	const llmSettings = {};
	const queryParams = new URLSearchParams(window.location.search);

	// Iterate over all query parameters found in the URL
	for (const [key, value] of queryParams.entries()) {
		// Basic type conversion for known numeric fields
		if (key === 'temperature') {
			const numValue = parseFloat(value);
			llmSettings[key] = isNaN(numValue) ? value : numValue;
		} else if (key === 'max_output_tokens') {
			const numValue = parseInt(value, 10);
			llmSettings[key] = isNaN(numValue) ? value : numValue;
		} else {
			llmSettings[key] = value;
		}
	}
	// Make the parameters globally available for other scripts
	window.llmSettings = llmSettings;
	console.log('LLM Settings:', window.llmSettings)

	// Check whether the page has the container.
	const contentContainer = document.querySelector('.container-md.markdown-body');
	if (!contentContainer) {
		console.error('Main content container (.container-md.markdown-body) not found.');
		return;
	}
	// Check whether the page has a header.
	const h1Element = contentContainer.querySelector('h1');
	if (!h1Element) {
		console.error('H1 element not found. UI elements might be misplaced.');
	}

	// 1. Create a wrapper for the dialogue content (will be populated by updateDisplayState)
	const dialogueWrapper = document.createElement('div');
	dialogueWrapper.id = 'dialogue-content-wrapper';

	// 2. Create the textarea for editing
	const textarea = document.createElement('textarea');
	textarea.id = 'dialogue-editor-textarea';
	textarea.className = 'form-control';
	textarea.style.display = 'none';

	// 3. Create container and button for file picking
	const filePickerContainer = document.createElement('div');
	filePickerContainer.id = 'file-picker-container';
	filePickerContainer.style.display = 'none'; // Initially hidden, updateDisplayState will show it

	const chooseFileButton = document.createElement('button');
	chooseFileButton.id = 'chooseFileButton';
	chooseFileButton.className = 'btn btn-primary'; // GitHub Primer style
	chooseFileButton.textContent = 'Choose File to Load Dialogue';
	filePickerContainer.appendChild(chooseFileButton);

	// 4. Insert dynamic elements into the DOM (after H1 or fallback)
	if (h1Element) {
		h1Element.after(dialogueWrapper, textarea, filePickerContainer);
	} else {
		contentContainer.prepend(dialogueWrapper, textarea, filePickerContainer); // Fallback
	}

	// 5. Initialize localStorage:
	// If 'multilogue' is null, try to populate from static HTML. Otherwise, use existing.
	let platoTextForInit = localStorage.getItem('multilogue');
	if (platoTextForInit === null) {
		platoTextForInit = ''; // Fallback to empty string
		localStorage.setItem('multilogue', platoTextForInit);
	}
	// Now, localStorage.getItem('multilogue') is guaranteed to be a string (possibly empty).
	
	// 6. Functions for token popup
	function showTokenPopup() {
		const popup = document.getElementById('tokenPopupOverlay');
		const input = document.getElementById('tokenPopupInput');
		if (popup && input) {
			input.value = '';
			popup.style.display = 'flex';
			input.focus();
		} else {
			console.error('Token pop-up elements (tokenPopupOverlay or tokenPopupInput) not found. Ensure HTML is present.');
			alert('Error: Token input dialog is missing. Cannot proceed without a token if fetch fails.');
		}
	}
	function hideTokenPopup() {
		const popup = document.getElementById('tokenPopupOverlay');
		if (popup) {
			popup.style.display = 'none';
		}
	}
	
	// 7. Function to update display based on localStorage content
	function updateDisplayState() {
		const currentPlatoText = localStorage.getItem('multilogue');
		// If there is some text.
		if (currentPlatoText && currentPlatoText.trim() !== '') {
			try {
				dialogueWrapper.innerHTML = platoTextToPlatoHtml(currentPlatoText);
			} catch (e) {
				console.error("Error rendering Plato text to HTML:", e);
				dialogueWrapper.innerHTML = "<p class='dialogue-error'>Error loading content. Please try editing or loading a new file.</p>";
			}
			dialogueWrapper.style.display = 'block';
			textarea.style.display = 'none';
			filePickerContainer.style.display = 'none';
			// Scroll to the bottom of the dialogue content after it's updated and shown
			dialogueWrapper.scrollIntoView({behavior: 'smooth', block: 'end'});

		} else {
			// No valid content, show file picker
			dialogueWrapper.style.display = 'none';
			textarea.style.display = 'none';
			filePickerContainer.style.display = 'flex'; // Use flex to enable centering
			dialogueWrapper.innerHTML = ''; // Clear any old content
			textarea.value = ''; // Clear textarea
		}
	}

	// Initial display update
	updateDisplayState();

	// 8. Event listener for "Choose File" button
	chooseFileButton.addEventListener('click', async () => {
		try {
			const [fileHandle] = await window.showOpenFilePicker({
				types: [{
					description: 'Text Files',
					accept: {
						'text/plain': ['.txt', '.md', '.text', '.plato'],
					}
				}]
			});
			const file = await fileHandle.getFile();
			const fileContent = await file.text();

			localStorage.setItem('multilogue', fileContent);
			textarea.value = fileContent;
			dialogueWrapper.style.display = 'none';
			filePickerContainer.style.display = 'none';
			textarea.style.display = 'block';
			textarea.focus();
		} catch (err) {
			if (err.name !== 'AbortError') { // User cancelled picker
				console.error('Error opening file:', err);
				alert(`Error opening file: ${err.message}`);
			}
		}
	});

	// 9. Event listener to switch to edit mode when dialogue content is clicked
	dialogueWrapper.addEventListener('click', () => {
		try {
			// Read directly from localStorage to ensure consistency
			textarea.value = localStorage.getItem('multilogue') || '';
			dialogueWrapper.style.display = 'none';
			textarea.style.display = 'block';
			filePickerContainer.style.display = 'none';
			textarea.focus();
		} catch (e) {
			alert("Could not switch to edit mode due to a content error.");
		}
	});

	// 10. Event listener for saving (Ctrl+Enter) in the textarea
	textarea.addEventListener('keydown', (event) => {
		if (event.ctrlKey && !event.shiftKey && event.key === 'Enter') {
			event.preventDefault();
			const newText = textarea.value;
			localStorage.setItem('multilogue', newText);
			updateDisplayState(); // Update display, which will show dialogue or button
		}
	});
	
	// 11. Event listener for saving to file (Ctrl+Shift+Enter) - Always "Save As"
	document.addEventListener('keydown', async (event) => {
		if (event.ctrlKey && event.shiftKey && event.key === 'Enter') {
			event.preventDefault();
			const textToSave = localStorage.getItem('multilogue') || '';

			if (!textToSave.trim()) {
				console.log('Ctrl+Shift+Enter: Dialogue content is empty. Nothing to save.');
				alert('Dialogue is empty. Nothing to save.');
				return; // Prevent saving an empty file
			}
			try {
				// Always prompt "Save As"
				const fileHandle = await window.showSaveFilePicker({
					suggestedName: 'multilogue.txt', // You can customize the suggested name
					types: [{
						description: 'Text Files',
						accept: {
							'text/plain': ['.txt', '.md', '.text', '.plato'],
						},
					}],
				});
				// Create a FileSystemWritableFileStream to write to.
				const writable = await fileHandle.createWritable();
				// Write the contents of the file to the stream.
				await writable.write(textToSave);
				// Close the file and write the contents to disk.
				await writable.close();

				updateDisplayState(); // Refresh the view

			} catch (err) {
				// Handle errors, e.g., if the user cancels the save dialog
				if (err.name !== 'AbortError') {
					console.error('Error saving file:', err);
					alert(`Could not save file: ${err.message}`);
				}
			}
		}
	});
	
	// Token popup save
	const tokenPopupSaveButton = document.getElementById('tokenPopupSaveButton');
	if (tokenPopupSaveButton) {
		tokenPopupSaveButton.addEventListener('click', async () => {
			const tokenInputVal = document.getElementById('tokenPopupInput').value;
			if (tokenInputVal && tokenInputVal.trim()) {
				window.llmSettings.token = tokenInputVal.trim();
				console.log('Token set manually via pop-up.');
				hideTokenPopup();
			} else {
				alert('Enter an API token.');
			}
		});
	} else {
		console.warn('Token pop-up save button (tokenPopupSaveButton) not found.');
	}
	// Token popup cancel
	const tokenPopupCancelButton = document.getElementById('tokenPopupCancelButton');
	if (tokenPopupCancelButton) {
		tokenPopupCancelButton.addEventListener('click', () => {
			hideTokenPopup();
			console.log('Token entry cancelled by user.');
		});
	}
	
	// 12. Event listener for LLM communications (Alt+Shift)
	document.addEventListener('keydown', async function (event) {
		if (event.altKey && event.shiftKey) {
			event.preventDefault();
			if (!window.llmSettings.token) {
				console.log('Token not found. Attempting to fetch from: https://localhost/' + window.machineConfig.token);
				try {
					const tokenResponse = await fetch('https://localhost/' + window.machineConfig.token);
					if (!tokenResponse.ok) {
						let errorDetails = `HTTP error fetching token! Status: ${tokenResponse.status}`;
						try {
							const errorBody = await tokenResponse.text();
							if (errorBody) errorDetails += ` - Body: ${errorBody.substring(0, 200)}`;
						} catch (e) { /* Ignore */
						}
						throw new Error(errorDetails);
					}
					const fetchedToken = (await tokenResponse.text()).trim();
					window.llmSettings.token = fetchedToken;
					console.log('Token fetched successfully from server.');
				} catch (fetchError) {
					console.error('Token fetch failed:', fetchError.message);
					showTokenPopup(); // Show pop-up to ask for token
					return; // Stop further execution in this handler, wait for pop-up interaction
				}
			}
			console.log('Token available. Proceeding with LLM interaction.');
			try {
				await runMachine(); // runMachine is async or handles promises
			} catch (error) {
				console.error('LLM interaction failed (runMachine):', error.message);
				alert(`LLM interaction failed: ${error.message}`);
			}
		}
	});
	
	// 13 Event listener for remote trigger from Chrome extension
	window.addEventListener('runMachineCommand', async function() { // Make the function async
		console.log('Received runMachineCommand event. Triggering LLM interaction.');
		if (!window.llmSettings.token) {
			console.log('Action: Fetching the API token from https://localhost/');
			const tokenResponse = await fetch('https://localhost/' + window.machineConfig.token);
			if (!tokenResponse.ok) {
				throw new Error(`HTTP error fetching token! status: ${tokenResponse.status}`);
			}
			window.llmSettings.token = (await tokenResponse.text()).trim();
			console.log('Action: Token fetched successfully.');
		}
		try {
			runMachine();
		} catch (error) { // Catch any errors from runMachine
			console.error('LLM interaction failed (runMachineCommand):', error.message);
		}
	});
	
	// 14. Update multilogue display from the localStorage
	window.addEventListener('localStorageChanged', function() {
		console.log('Received localStorageChanged event. Triggering multilogue update.');
		updateDisplayState();
	});
	
	// 15. Update display when tab becomes visible again
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			// console.log('Page is now visible, ensuring display is up to date.');
			if (typeof updateDisplayState === 'function') {
				updateDisplayState();
			} else {
				console.warn('Page Script (visibilitychange): updateDisplayState function not found.');
			}
		}
	});
	
	// 16. Escape key listener to close the token pop-up
	document.addEventListener('keydown', function(event) {
		if (event.key === 'Escape') {
			const tokenPopup = document.getElementById('tokenPopupOverlay');
			if (tokenPopup && tokenPopup.style.display === 'flex') {
				hideTokenPopup();
			}
		}
	});
});
