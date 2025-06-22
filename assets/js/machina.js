function runMachine() {
  const currentDialogueWrapper = document.getElementById('dialogue-content-wrapper');
  if (!currentDialogueWrapper) {
    const errorMsg = 'LLM Interaction: dialogue-content-wrapper not found.';
    console.error(errorMsg);
    alert('Error: Could not find the dialogue content to send.');
    return;
  }
  
  const htmlContent = currentDialogueWrapper.innerHTML;
  if (!htmlContent || htmlContent.trim() === '') {
    const infoMsg = 'LLM Interaction: Dialogue content is empty. Nothing to send.';
    console.log(infoMsg);
    alert('Dialogue is empty. Please add some content first.');
    return;
  }
  
  console.log('Preparing to send dialogue to LLM worker...');
  
  try {
    const cmjMessages = platoHtmlToCmj(htmlContent);
    const mujMessages = platoHtmlToMuj(htmlContent);
    
    if (!window.machineConfig || !window.machineConfig.work || !window.machineConfig.name) {
      const errorMsg = "LLM Interaction: machineConfig is not properly set up (missing work or name).";
      console.error(errorMsg);
      alert("Error: LLM configuration is incomplete.");
      return;
    }
    
    const userQueryParameters = {
      config: window.machineConfig,
      settings: window.llmSettings,
      messages: mujMessages
    };
    
    console.log('LLM Interaction: Launching LLM worker with MUJ messages:', userQueryParameters);
    const llmWorker = new Worker(window.machineConfig.work);
    
    llmWorker.onmessage = function (e) {
      console.log('Main thread: Message received from worker:', e.data);
      if (e.data.type === 'success') {
        console.log('Worker task successful. LLM Response:', e.data.data);
        try {
          const llmResponseData = e.data.data;
          if (!llmResponseData) {
            const errorMsg = 'LLM response is missing essential content.';
            console.error(errorMsg);
            alert('Received an incomplete or invalid response from the LLM.');
          }
          
          const regularText = llmResponseData
            .filter(item => item.type === 'message' && Array.isArray(item.content))
            .flatMap(item =>
              item.content
                .filter(contentPart => contentPart && typeof contentPart.text === 'string')
                .map(contentPart => contentPart.text)
            )
            .join(' ');
          const desoupedText = llmSoupToText(regularText);
          
          const thoughtsText = llmResponseData
            .filter(item => item.type === 'reasoning' && Array.isArray(item.summary))
            .flatMap(item =>
              item.summary
                .filter(contentPart => contentPart && typeof contentPart.text === 'string')
                .map(contentPart => contentPart.text)
            )
            .join('\n');
          const desoupedThoughts = llmSoupToText(thoughtsText);
          
          const newCmjMessage = {
            role: 'assistant',
            name: window.machineConfig.name,
            content: desoupedText
          };
          
          cmjMessages.push(newCmjMessage);
          const updatedPlatoText = CmjToPlatoText(cmjMessages);
          
          if (typeof updatedPlatoText !== 'string') {
            const errorMsg = 'Failed to convert updated CMJ to PlatoText.';
            console.error(errorMsg);
            alert('Error processing the LLM response for display.');
            return;
          }
          
          // If the model did not respond with one of the utterances symbolizing 'pass'
          const passUtterances = ['...', 'silence', 'pass'];
          if (desoupedText && desoupedText.trim() !== '' &&
            !passUtterances.includes(desoupedText.trim().toLowerCase())) {
            localStorage.setItem('multilogue', updatedPlatoText);
          }
          if (desoupedThoughts && desoupedThoughts.trim() !== '') {
            localStorage.setItem('thoughts', desoupedThoughts);
          }
        } catch (processingError) {
          console.error('Error processing LLM response:', processingError);
          alert('An error occurred while processing the LLM response: ' + processingError.message);
        }
      } else if (e.data.type === 'error') {
        console.error('Main thread: Error message from worker:', e.data.error);
        alert('Worker reported an error: ' + e.data.error);
      }
      llmWorker.terminate(); // Terminate worker after processing
    };
    
    llmWorker.onerror = function (error) {
      console.error('Main thread: An error occurred with the worker script:', error.message, error);
      alert('Failed to initialize or run worker: ' + error.message);
      llmWorker.terminate(); // Terminate worker on error
    };
    
    llmWorker.postMessage(userQueryParameters);
    console.log('Main thread: Worker launched and messages sent.');
    
  } catch (e) {
    console.error('LLM Interaction: Failed to process dialogue or communicate with the worker:', e);
    alert('Error preparing data for LLM: ' + e.message);
  }
}