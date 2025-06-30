/**
 * A helper to safely update the 'cot' (Chain of Thought) object 
 * for the currently active job's message bubble.
 * @param {object} state - The current state.
 * @param {object} cotPayload - The new CoT data to merge.
 * @returns {object} The new state with the updated message.
 */
/**
 * Finds the most recent assistant message for a given job ID.
 * @param {Array} messages - The array of all chat messages.
 * @param {string} jobId - The ID of the job to find the message for.
 * @returns {{index: number, message: object|null}}
 */
const findLastJobMessage = (messages, jobId) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'assistant' && messages[i].jobId === jobId) {
      return { index: i, message: messages[i] };
    }
  }
  return { index: -1, message: null };
};

export const updateActiveJobMessage = (state, cotPayload) => {
  if (!state.activeJobId) return state;

  const { index } = findLastJobMessage(state.messages, state.activeJobId);
  if (index === -1) return state; // Should not happen if START_JOB ran

  const newMessages = [...state.messages];
  const updatedMessage = JSON.parse(JSON.stringify(newMessages[index]));
  updatedMessage.cot = { ...updatedMessage.cot, ...cotPayload };
  newMessages[index] = updatedMessage;
  
  return { ...state, messages: newMessages };
};
