function toggleChat() {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.classList.toggle('hidden');
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value;
    if (message.trim() === '') return;

    const chatContent = document.getElementById('chat-content');
    const userMessage = document.createElement('div');
    userMessage.textContent = 'You: ' + message;
    chatContent.appendChild(userMessage);

    input.value = '';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        const data = await response.json();
        const assistantMessage = document.createElement('div');
        assistantMessage.textContent = 'GPT-4: ' + data.message;
        chatContent.appendChild(assistantMessage);
    } catch (error) {
        console.error('Error:', error);
    }
}