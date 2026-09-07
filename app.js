let chatMessages = [];
const renderedChatKeys = new Set();
const nicknameStorageKey = 'zoo-anonymous-nickname';
const supabaseSettings = window.ZOO_SUPABASE || {};
const supabaseClient = window.supabase && supabaseSettings.url && supabaseSettings.anonKey
	? window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey)
	: null;
const chatMessagesList = document.querySelector('#chat-messages');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');

function getNickname() {
	return localStorage.getItem(nicknameStorageKey) || 'anônimo';
}

function setupNicknameField() {
	if (!chatForm || !chatInput) return;
	const nicknameInput = document.createElement('input');
	nicknameInput.id = 'nickname-input';
	nicknameInput.maxLength = 30;
	nicknameInput.value = getNickname();
	nicknameInput.placeholder = 'seu apelido';
	nicknameInput.className = 'nickname-input';
	nicknameInput.style.flex = '0 1 140px';
	nicknameInput.style.borderBottom = '1px solid var(--line)';
	nicknameInput.style.padding = '6px 0';
	nicknameInput.setAttribute('aria-label', 'Seu apelido anônimo');
	nicknameInput.addEventListener('change', () => {
		const nickname = nicknameInput.value.trim().slice(0, 30) || 'anônimo';
		nicknameInput.value = nickname;
		localStorage.setItem(nicknameStorageKey, nickname);
	});
	chatForm.insertBefore(nicknameInput, chatInput);
}

function messageKey(message) {
	return message.id || `${message.created_at || message.createdAt}-${message.nickname}-${message.text}`;
}

function formatMessageTime(createdAt) {
	return new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
	return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

function renderChat() {
	const incomingKeys = new Set(chatMessages.map(messageKey));
	if ([...renderedChatKeys].some((key) => !incomingKeys.has(key))) {
		chatMessagesList.replaceChildren();
		renderedChatKeys.clear();
	}
	let addedMessage = false;
	chatMessages.forEach((message) => {
		const key = messageKey(message);
		if (renderedChatKeys.has(key)) return;
		const createdAt = message.created_at || message.createdAt;
		const article = document.createElement('article');
		article.className = 'chat-message';
		article.innerHTML = `<div class="chat-message-top"><strong>${escapeHtml(message.nickname || 'anônimo')}</strong><span>${formatMessageTime(createdAt)}</span></div><p>${escapeHtml(message.text)}</p>`;
		chatMessagesList.append(article);
		renderedChatKeys.add(key);
		addedMessage = true;
	});
	if (addedMessage) chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
}

async function loadChatMessages() {
	try {
		if (!supabaseClient) throw new Error('Supabase não configurado.');
		const { data, error } = await supabaseClient
			.from('messages')
			.select('id, nickname, text, created_at')
			.order('created_at', { ascending: true })
			.limit(100);
		if (error) throw error;
		chatMessages = data || [];
		renderChat();
	} catch (error) {
		console.error(error);
	}
}

chatForm?.addEventListener('submit', async (event) => {
	event.preventDefault();
	const text = chatInput.value.trim();
	const nicknameInput = document.querySelector('#nickname-input');
	const nickname = (nicknameInput?.value.trim() || 'anônimo').slice(0, 30);
	if (!text || !supabaseClient) return;
	localStorage.setItem(nicknameStorageKey, nickname || 'anônimo');
	const button = chatForm.querySelector('button[type="submit"]');
	button.disabled = true;
	const { error } = await supabaseClient.from('messages').insert({ nickname: nickname || 'anônimo', text });
	if (!error) {
		chatInput.value = '';
		await loadChatMessages();
	} else {
		console.error(error);
	}
	button.disabled = false;
	chatInput.focus();
});

setupNicknameField();
loadChatMessages();
if (supabaseClient) {
	supabaseClient
		.channel('zoo-messages')
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadChatMessages)
		.subscribe();
}
