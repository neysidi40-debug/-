let topics = [];
let chatMessages = [];
const supabaseSettings = window.ZOO_SUPABASE || {};
const supabaseClient = window.supabase && supabaseSettings.url && supabaseSettings.anonKey
  ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey)
  : null;
let activeRoom = 'zoo';
const topicList = document.querySelector('#topic-list');
const roomLabel = document.querySelector('#room-label');
const boardTitle = document.querySelector('#board-title');
const input = document.querySelector('#topic-input');
const toast = document.querySelector('#toast');
const composer = document.querySelector('#composer');
const loadMore = document.querySelector('#load-more');
const sortControl = document.querySelector('#sort-control');
const chatView = document.querySelector('#chat-view');
const chatMessagesList = document.querySelector('#chat-messages');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');

function roomName(room) {
  if (room === 'zoo') return 'ZOO';
  return room === 'todos' ? 'todas as conversas' : room;
}

function renderTopics() {
  const filtered = activeRoom === 'todos' ? topics : topics.filter((topic) => topic.room === activeRoom);
  topicList.innerHTML = filtered.map((topic, index) => `
    <article class="topic" style="animation-delay: ${index * 45}ms">
      <div class="topic-avatar">${topic.mark || '✳'}</div>
      <div class="topic-main">
        <a class="topic-title" href="#conversation">${escapeHtml(topic.title)}</a>
        <div class="topic-meta"><span class="room-tag">#${topic.room}</span> · ${topic.author} · ${topic.time}</div>
      </div>
      <div class="topic-stats">
        <div><strong>${topic.replies}</strong><span>respostas</span></div>
        <div><strong>${topic.views}</strong><span>leituras</span></div>
      </div>
    </article>
  `).join('') || '<p class="empty-state">ainda não há conversas nesta sala.</p>';
}

function renderChat() {
  chatMessagesList.innerHTML = chatMessages.map((message, index) => `
    <article class="chat-message ${message.author === 'anônimo' ? 'mine' : ''}" style="animation-delay: ${index * 45}ms">
      <div class="chat-message-top"><strong>${escapeHtml(message.author)}</strong><span>${message.time}</span></div>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join('');
  chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
}

function formatMessageTime(createdAt) {
  return new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function loadChatMessages() {
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('messages')
        .select('id, text, created_at')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      chatMessages = data.map((message) => ({
        ...message,
        author: 'anônimo',
        time: formatMessageTime(message.created_at)
      }));
    } else {
      const response = await fetch('/api/messages', { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar as mensagens.');
      const messages = await response.json();
      chatMessages = messages.map((message) => ({ ...message, time: formatMessageTime(message.createdAt) }));
    }
    renderChat();
  } catch (error) {
    showToast('não foi possível conectar à ZOO.');
  }
}

function showRoom(room) {
  const isChat = room === 'zoo';
  composer.hidden = isChat;
  topicList.hidden = isChat;
  loadMore.hidden = isChat;
  sortControl.hidden = isChat;
  chatView.hidden = !isChat;
  roomLabel.textContent = roomName(room);
  boardTitle.innerHTML = isChat ? 'ZOO <span class="live-badge">conversa</span>' : 'conversas recentes <span class="live-badge">ao vivo</span>';
  if (isChat) renderChat();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}

document.querySelectorAll('.room').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('.room.active').classList.remove('active');
    button.classList.add('active');
    activeRoom = button.dataset.room;
    roomLabel.textContent = roomName(activeRoom);
    showRoom(activeRoom);
    if (activeRoom !== 'zoo') renderTopics();
  });
});

document.querySelector('#publish-topic').addEventListener('click', () => {
  const title = input.value.trim();
  if (!title) {
    showToast('escreva alguma coisa antes de publicar.');
    input.focus();
    return;
  }
  topics.unshift({ title, room: activeRoom === 'todos' ? 'desabafos' : activeRoom, author: 'anônimo', time: 'agora', replies: 0, views: 1, mark: '✳' });
  localStorage.setItem('entre-nos-topics', JSON.stringify(topics));
  input.value = '';
  renderTopics();
  showToast('tópico publicado anonimamente.');
});

document.querySelector('#focus-chat').addEventListener('click', () => {
  chatView.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => chatInput.focus(), 450);
});

document.querySelector('#sort-button').addEventListener('click', (event) => {
  const newestFirst = event.currentTarget.dataset.order !== 'oldest';
  topics.reverse();
  event.currentTarget.dataset.order = newestFirst ? 'oldest' : 'newest';
  event.currentTarget.textContent = newestFirst ? 'mais antigas⌄' : 'mais recentes⌄';
  renderTopics();
});

document.querySelector('#load-more').addEventListener('click', () => showToast('você chegou ao começo da conversa.'));
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const submitButton = chatForm.querySelector('button');
  submitButton.disabled = true;
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from('messages').insert({ text });
      if (error) throw error;
    } else {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error('Não foi possível enviar a mensagem.');
    }
    chatInput.value = '';
    await loadChatMessages();
  } catch (error) {
    showToast('não foi possível enviar a mensagem.');
  } finally {
    submitButton.disabled = false;
    chatInput.focus();
  }
});
renderTopics();
showRoom('zoo');
loadChatMessages();
window.setInterval(loadChatMessages, 2000);
if (supabaseClient) {
  supabaseClient
    .channel('zoo-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadChatMessages)
    .subscribe();
}
