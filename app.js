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
const photoPreview = document.querySelector('#photo-preview');
const photoPreviewImage = document.querySelector('#photo-preview-image');
const clearPhotoButton = document.querySelector('#clear-photo');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxClose = document.querySelector('#lightbox-close');
const chatEmpty = document.querySelector('#chat-empty');
const messageCount = document.querySelector('#message-count');
const charCount = document.querySelector('#char-count');
const headerClock = document.querySelector('#header-clock');
const connectionStatus = document.querySelector('#connection-status');
const focusChatButton = document.querySelector('#focus-chat');

function openLightbox(url) {
	if (!lightbox || !lightboxImage) return;
	lightboxImage.src = url;
	lightbox.hidden = false;
}

function closeLightbox() {
	if (!lightbox || !lightboxImage) return;
	lightbox.hidden = true;
	lightboxImage.src = '';
}

lightboxClose?.addEventListener('click', closeLightbox);
lightbox?.addEventListener('click', (event) => {
	if (event.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape') return;
	const changelogOverlay = document.querySelector('#changelog-overlay');
	if (changelogOverlay && !changelogOverlay.hidden) {
		closeChangelog();
		return;
	}
	if (lightbox && !lightbox.hidden) closeLightbox();
});
const uploadProgressWrap = document.querySelector('#photo-upload-progress');
const uploadProgressBar = document.querySelector('#photo-upload-progress-bar');
const notifyButton = document.querySelector('#enable-notifications');
const ownMessageIds = new Set();
const VAPID_PUBLIC_KEY = 'BLPFhZtNI9Y7Tf19xEqitKIwh0W4IpAMz7lWaoJAuTnQfdMs2L5TNZsBrkwbB8_dfgUn-hAVfvIOUeW7xQP0R1U';

function urlBase64ToUint8Array(base64String) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function subscribeToPush() {
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !supabaseClient) return;
	try {
		const registration = await navigator.serviceWorker.register('sw.js');
		await navigator.serviceWorker.ready;
		let subscription = await registration.pushManager.getSubscription();
		if (!subscription) {
			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
			});
		}
		const raw = subscription.toJSON();
		if (!raw.endpoint || !raw.keys) return;
		await supabaseClient.from('push_subscriptions').upsert(
			{ endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth },
			{ onConflict: 'endpoint' }
		);
	} catch (error) {
		console.error('Falha ao inscrever para notificações push.', error);
	}
}
let replyTo = null;
let selectedPhoto = null;
let selectedPhotoUrl = null;

function showPhotoPreview(file) {
	if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
	selectedPhotoUrl = URL.createObjectURL(file);
	photoPreviewImage.src = selectedPhotoUrl;
	photoPreview.hidden = false;
}

function clearPhotoPreview() {
	if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
	selectedPhotoUrl = null;
	selectedPhoto = null;
	photoInput.value = '';
	photoPreviewImage.src = '';
	photoPreview.hidden = true;
	resetUploadProgress();
}

function setUploadProgress(percent) {
	uploadProgressWrap.hidden = false;
	uploadProgressBar.style.width = `${Math.max(4, percent)}%`;
}

function resetUploadProgress() {
	uploadProgressWrap.hidden = true;
	uploadProgressBar.style.width = '0%';
}

async function compressImage(file) {
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
	try {
		const bitmap = await createImageBitmap(file);
		const maxDimension = 1600;
		let { width, height } = bitmap;
		if (width > maxDimension || height > maxDimension) {
			const scale = maxDimension / Math.max(width, height);
			width = Math.round(width * scale);
			height = Math.round(height * scale);
		}
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
		if (!blob || blob.size >= file.size) return file;
		return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
	} catch (error) {
		console.error('Falha ao comprimir imagem, enviando original.', error);
		return file;
	}
}

function uploadPhotoWithProgress(file, bucket, objectPath, onProgress) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `${supabaseSettings.url}/storage/v1/object/${bucket}/${objectPath}`);
		xhr.setRequestHeader('Authorization', `Bearer ${supabaseSettings.anonKey}`);
		xhr.setRequestHeader('apikey', supabaseSettings.anonKey);
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
		xhr.setRequestHeader('x-upsert', 'false');
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve();
			else reject(new Error(`Upload falhou (status ${xhr.status})`));
		};
		xhr.onerror = () => reject(new Error('Falha de rede no upload.'));
		xhr.send(file);
	});
}

function updateNotifyButtonLabel() {
	if (!notifyButton) return;
	if (!('Notification' in window)) {
		notifyButton.remove();
		return;
	}
	if (Notification.permission === 'granted') {
		notifyButton.textContent = 'notificações ativas';
		notifyButton.disabled = true;
	} else if (Notification.permission === 'denied') {
		notifyButton.textContent = 'notificações bloqueadas';
		notifyButton.disabled = true;
	} else {
		notifyButton.textContent = 'ativar notificações';
		notifyButton.disabled = false;
	}
}

notifyButton?.addEventListener('click', async () => {
	if (!('Notification' in window)) return;
	const permission = await Notification.requestPermission();
	updateNotifyButtonLabel();
	if (permission === 'granted') await subscribeToPush();
});

updateNotifyButtonLabel();
if ('Notification' in window && Notification.permission === 'granted') subscribeToPush();

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
	chatInput.parentElement.insertBefore(nicknameInput, chatInput);
}

function updateClock() {
	if (!headerClock) return;
	const now = new Date();
	headerClock.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
	headerClock.dateTime = now.toISOString();
}

function updateCharCount() {
	if (!charCount || !chatInput) return;
	charCount.textContent = `${chatInput.value.length}/280`;
}

function updateChatChrome() {
	if (chatEmpty) chatEmpty.hidden = chatMessages.length > 0;
	if (messageCount) messageCount.textContent = `${chatMessages.length} ${chatMessages.length === 1 ? 'msg' : 'msgs'}`;
}

function setConnectionStatus(label, live) {
	if (!connectionStatus) return;
	connectionStatus.textContent = label;
	connectionStatus.classList.toggle('is-live', live);
	connectionStatus.classList.toggle('is-off', !live);
}

focusChatButton?.addEventListener('click', () => {
	document.querySelector('#chat-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	chatInput?.focus();
});

chatInput?.addEventListener('input', updateCharCount);
updateClock();
updateCharCount();
setInterval(updateClock, 1000);

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
		if (message.id && ownMessageIds.has(message.id)) article.classList.add('is-own');
		const reply = message.reply_to ? chatMessages.find((item) => item.id === message.reply_to) : null;
		const replyHtml = reply ? `<button class="reply-reference" data-reply-id="${reply.id}" type="button">↪ ${escapeHtml(reply.nickname || 'anônimo')}: ${escapeHtml(reply.text || reply.image_name || 'foto')}</button>` : '';
		const imageHtml = message.image_url ? `<img class="message-image" src="${escapeHtml(message.image_url)}" alt="Foto enviada por ${escapeHtml(message.nickname || 'anônimo')}">` : '';
		article.innerHTML = `<div class="chat-message-top"><strong>${escapeHtml(message.nickname || 'anônimo')}</strong><span>${formatMessageTime(createdAt)}</span></div>${replyHtml}<p>${escapeHtml(message.text || '')}</p>${imageHtml}<button class="reply-button" data-reply-id="${message.id}" type="button">responder</button>`;
		chatMessagesList.append(article);
		renderedChatKeys.add(key);
		addedMessage = true;
	});
	updateChatChrome();
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
		updateChatChrome();
	} catch (error) {
		console.error(error);
		setConnectionStatus('offline', false);
	}
}

chatMessagesList.addEventListener('click', (event) => {
	const image = event.target.closest('.message-image');
	if (image) {
		openLightbox(image.src);
		return;
	}
	const button = event.target.closest('[data-reply-id]');
	if (!button) return;
	const message = chatMessages.find((item) => String(item.id) === button.dataset.replyId);
	if (message) selectReply(message);
});

photoInput.addEventListener('change', () => {
	const file = photoInput.files[0] || null;
	if (file && file.size > 5 * 1024 * 1024) {
		alert('A foto precisa ter no máximo 5 MB.');
		clearPhotoPreview();
		return;
	}
	selectedPhoto = file;
	if (selectedPhoto) {
		showPhotoPreview(selectedPhoto);
	} else {
		clearPhotoPreview();
	}
});

clearPhotoButton?.addEventListener('click', () => {
	clearPhotoPreview();
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
		const photoToUpload = await compressImage(selectedPhoto);
		const safeName = photoToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '-');
		const objectPath = `${Date.now()}-${safeName}`;
		try {
			setUploadProgress(4);
			await uploadPhotoWithProgress(photoToUpload, 'zoo-images', objectPath, setUploadProgress);
		} catch (uploadError) {
			console.error(uploadError);
			resetUploadProgress();
			button.disabled = false;
			chatInput.focus();
			return;
		}
		imageUrl = supabaseClient.storage.from('zoo-images').getPublicUrl(objectPath).data.publicUrl;
		imageName = selectedPhoto.name;
	}
	const { data: inserted, error } = await supabaseClient.from('messages').insert({ nickname: nickname || 'anônimo', text: text || null, reply_to: replyTo?.id || null, image_url: imageUrl, image_name: imageName }).select().single();
	if (!error) {
		if (inserted) ownMessageIds.add(inserted.id);
		if (inserted && !chatMessages.some((item) => item.id === inserted.id)) {
			chatMessages.push(inserted);
			renderChat();
		}
		chatInput.value = '';
		clearPhotoPreview();
		replyTo = null;
		replyPreview.hidden = true;
		updateCharCount();
	} else {
		console.error(error);
	}
	button.disabled = false;
	chatInput.focus();
});

const changelogSeenKey = 'zoo-changelog-seen';
const changelogOverlay = document.querySelector('#changelog-overlay');
const changelogList = document.querySelector('#changelog-list');
const changelogPreview = document.querySelector('#changelog-preview');
const changelogBadge = document.querySelector('#log-badge');
const changelogLead = document.querySelector('#changelog-lead');
const changelogLatestDate = document.querySelector('#changelog-latest-date');
let changelogEntries = [];
let changelogOpenedByUpdate = false;

function formatLogDate(value) {
	const date = new Date(`${value}T12:00:00`);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString('pt-BR');
}

function latestChangelogId() {
	return changelogEntries[0]?.id || '';
}

function hasUnseenChangelog() {
	const latest = latestChangelogId();
	return Boolean(latest && localStorage.getItem(changelogSeenKey) !== latest);
}

function markChangelogSeen() {
	const latest = latestChangelogId();
	if (latest) localStorage.setItem(changelogSeenKey, latest);
	updateChangelogBadge();
}

function updateChangelogBadge() {
	if (!changelogBadge) return;
	changelogBadge.hidden = !hasUnseenChangelog();
}

function renderChangelog() {
	const latest = changelogEntries[0];
	if (changelogLatestDate) changelogLatestDate.textContent = latest ? formatLogDate(latest.date) : '—';
	if (changelogPreview) {
		changelogPreview.replaceChildren();
		changelogEntries.slice(0, 3).forEach((entry) => {
			const item = document.createElement('li');
			item.innerHTML = `<time datetime="${escapeHtml(entry.date)}">${escapeHtml(formatLogDate(entry.date))}</time><strong>${escapeHtml(entry.title)}</strong>`;
			changelogPreview.append(item);
		});
	}
	if (changelogList) {
		changelogList.replaceChildren();
		changelogEntries.forEach((entry, index) => {
			const item = document.createElement('li');
			item.className = `changelog-entry${index === 0 && hasUnseenChangelog() ? ' is-new' : ''}`;
			item.dataset.id = entry.id;
			const details = (entry.items || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
			item.innerHTML = `<time datetime="${escapeHtml(entry.date)}">${escapeHtml(formatLogDate(entry.date))}</time><h3>${escapeHtml(entry.title)}</h3><ul>${details}</ul>`;
			changelogList.append(item);
		});
	}
	updateChangelogBadge();
}

function openChangelog({ auto = false } = {}) {
	if (!changelogOverlay) return;
	changelogOpenedByUpdate = auto;
	if (changelogLead) {
		changelogLead.textContent = auto && changelogEntries[0]
			? `att nova: ${changelogEntries[0].title}`
			: 'o que mudou no ZOO';
	}
	renderChangelog();
	changelogOverlay.hidden = false;
}

function closeChangelog() {
	if (!changelogOverlay) return;
	changelogOverlay.hidden = true;
	markChangelogSeen();
	changelogOpenedByUpdate = false;
	renderChangelog();
}

async function loadChangelog({ announce = false } = {}) {
	try {
		const response = await fetch(`changelog.json?t=${Date.now()}`, { cache: 'no-store' });
		if (!response.ok) throw new Error('Log indisponível.');
		const data = await response.json();
		changelogEntries = Array.isArray(data.entries) ? data.entries : [];
		renderChangelog();
		const latest = latestChangelogId();
		if (!announce || !latest || latest === localStorage.getItem(changelogSeenKey)) return;
		if (changelogOverlay && !changelogOverlay.hidden) return;
		openChangelog({ auto: true });
	} catch (error) {
		console.error(error);
	}
}

function setupChangelog() {
	document.querySelector('#open-changelog')?.addEventListener('click', () => openChangelog());
	document.querySelector('#open-changelog-sidebar')?.addEventListener('click', () => openChangelog());
	document.querySelector('#close-changelog')?.addEventListener('click', closeChangelog);
	changelogOverlay?.addEventListener('click', (event) => {
		if (event.target === changelogOverlay) closeChangelog();
	});
	loadChangelog({ announce: true });
	setInterval(() => loadChangelog({ announce: true }), 60 * 1000);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') loadChangelog({ announce: true });
	});
}

setupNicknameField();
loadChatMessages();
setupChangelog();
if (supabaseClient) {
	supabaseClient
		.channel('zoo-messages')
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
			if (payload.new && !chatMessages.some((item) => item.id === payload.new.id)) {
				chatMessages.push(payload.new);
				renderChat();
			}
		})
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') setConnectionStatus('ao vivo', true);
			else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionStatus('sinal fraco', false);
			else if (status === 'CLOSED') setConnectionStatus('offline', false);
		});
} else {
	setConnectionStatus('offline', false);
}