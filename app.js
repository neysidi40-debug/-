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
const photoInput = document.querySelector('#photo-input');
const replyPreview = document.querySelector('#reply-preview');
let replyTo = null;
let selectedPhoto = null;

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
		const reply = message.reply_to ? chatMessages.find((item) => item.id === message.reply_to) : null;
		const replyHtml = reply ? `<button class="reply-reference" data-reply-id="${reply.id}" type="button">↪ ${escapeHtml(reply.nickname || 'anônimo')}: ${escapeHtml(reply.text || reply.image_name || 'foto')}</button>` : '';
		const imageHtml = message.image_url ? `<img class="message-image" src="${escapeHtml(message.image_url)}" alt="Foto enviada por ${escapeHtml(message.nickname || 'anônimo')}">` : '';
		article.innerHTML = `<div class="chat-message-top"><strong>${escapeHtml(message.nickname || 'anônimo')}</strong><span>${formatMessageTime(createdAt)}</span></div>${replyHtml}<p>${escapeHtml(message.text || '')}</p>${imageHtml}<button class="reply-button" data-reply-id="${message.id}" type="button">responder</button>`;
		chatMessagesList.append(article);
		renderedChatKeys.add(key);
		addedMessage = true;
	});
	if (addedMessage) chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
}

function selectReply(message) {
	replyTo = message;
	replyPreview.hidden = false;
	replyPreview.innerHTML = `respondendo a <strong>${escapeHtml(message.nickname || 'anônimo')}</strong>: ${escapeHtml(message.text || message.image_name || 'foto')} <button id="cancel-reply" type="button">×</button>`;
	document.querySelector('#cancel-reply').addEventListener('click', () => { replyTo = null; replyPreview.hidden = true; });
	chatInput.focus();
}

async function loadChatMessages() {
	try {
		if (!supabaseClient) throw new Error('Supabase não configurado.');
			const { data, error } = await supabaseClient
				.from('messages')
				.select('id, nickname, text, created_at, reply_to, image_url, image_name')
			.order('created_at', { ascending: true })
			.limit(100);
		if (error) throw error;
		chatMessages = data || [];
		renderChat();
	} catch (error) {
		console.error(error);
	}
}

chatMessagesList.addEventListener('click', (event) => {
	const button = event.target.closest('[data-reply-id]');
	if (!button) return;
	const message = chatMessages.find((item) => String(item.id) === button.dataset.replyId);
	if (message) selectReply(message);
});

photoInput.addEventListener('change', () => {
	selectedPhoto = photoInput.files[0] || null;
	if (selectedPhoto && selectedPhoto.size > 5 * 1024 * 1024) {
		selectedPhoto = null;
		photoInput.value = '';
		alert('A foto precisa ter no máximo 5 MB.');
	}
});

chatForm?.addEventListener('submit', async (event) => {
	event.preventDefault();
	const text = chatInput.value.trim();
	const nicknameInput = document.querySelector('#nickname-input');
	const nickname = (nicknameInput?.value.trim() || 'anônimo').slice(0, 30);
	if ((!text && !selectedPhoto) || !supabaseClient) return;
	localStorage.setItem(nicknameStorageKey, nickname || 'anônimo');
	const button = chatForm.querySelector('button[type="submit"]');
	button.disabled = true;
	let imageUrl = null;
	let imageName = null;
	if (selectedPhoto) {
		const safeName = selectedPhoto.name.replace(/[^a-zA-Z0-9._-]/g, '-');
		const objectPath = `${Date.now()}-${safeName}`;
		const upload = await supabaseClient.storage.from('zoo-images').upload(objectPath, selectedPhoto, { upsert: false, contentType: selectedPhoto.type });
		if (upload.error) throw upload.error;
		imageUrl = supabaseClient.storage.from('zoo-images').getPublicUrl(objectPath).data.publicUrl;
		imageName = selectedPhoto.name;
	}
	const { error } = await supabaseClient.from('messages').insert({ nickname: nickname || 'anônimo', text, reply_to: replyTo?.id || null, image_url: imageUrl, image_name: imageName });
	if (!error) {
		chatInput.value = '';
		photoInput.value = '';
		selectedPhoto = null;
		replyTo = null;
		replyPreview.hidden = true;
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
