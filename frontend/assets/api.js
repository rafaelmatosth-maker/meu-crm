const currentOrigin = String(window.location.origin || '');
const explicitApiBase = String(window.localStorage.getItem('api_base_url') || '').trim();
const API_BASE_URL = explicitApiBase || currentOrigin || 'http://localhost:3000';

function getToken() {
  const local = localStorage.getItem('token');
  if (local) return local;
  if (window.__tokenFromUrl) return window.__tokenFromUrl;
  const match = document.cookie.match(/(?:^|; )token_js=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getEscritorioId() {
  const value = localStorage.getItem('escritorio_id');
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function setEscritorioId(escritorioId) {
  const parsed = Number(escritorioId);
  if (Number.isInteger(parsed) && parsed > 0) {
    localStorage.setItem('escritorio_id', String(parsed));
  }
}

function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('escritorio_id');
}

function withAuthHeaders(headers = {}) {
  const nextHeaders = { ...headers };
  const token = getToken();
  const escritorioId = getEscritorioId();

  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }
  if (escritorioId) {
    nextHeaders['X-Escritorio-Id'] = String(escritorioId);
  }

  return nextHeaders;
}

async function apiRequest(path, options = {}) {
  const headers = withAuthHeaders(options.headers || {});
  if (!headers.Accept) headers.Accept = 'application/json';
  if (!headers['X-Requested-With']) headers['X-Requested-With'] = 'XMLHttpRequest';
  if (!headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.erro || 'Erro inesperado.';
    throw new Error(message);
  }
  return data;
}

async function login(email, senha) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: JSON.stringify({ email, senha }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.erro || 'Erro inesperado.';
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  setToken(data.token);
  if (data.escritorio_atual && data.escritorio_atual.id) {
    setEscritorioId(data.escritorio_atual.id);
  }
  return data;
}

async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
  clearToken();
}

async function getMe() {
  const data = await apiRequest('/auth/me');
  if (data.escritorio_atual && data.escritorio_atual.id) {
    setEscritorioId(data.escritorio_atual.id);
  }
  return data;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

async function parseResponseBody(response) {
  const rawText = await response.text().catch(() => '');
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = {};
  }
  return { rawText, data };
}

function buildChunkUploadId() {
  return `modelo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function uploadModeloByChunks(nome, file) {
  const chunkSize = 512 * 1024;
  const totalChunks = Math.max(1, Math.ceil((Number(file.size) || 0) / chunkSize));
  const uploadId = buildChunkUploadId();

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunkBlob = file.slice(start, end);
    const formData = new FormData();
    formData.append('upload_id', uploadId);
    formData.append('total_chunks', String(totalChunks));
    formData.append('chunk_index', String(chunkIndex));
    formData.append('original_name', String(file.name || 'modelo.docx'));
    formData.append('chunk', chunkBlob, String(file.name || 'modelo.docx'));

    const chunkResp = await fetch(`${API_BASE_URL}/documentos-modelos/chunk`, {
      method: 'POST',
      headers: withAuthHeaders({
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      }),
      body: formData,
      credentials: 'include',
    });

    const { rawText, data } = await parseResponseBody(chunkResp);
    if (!chunkResp.ok) {
      const rawTrimmed = String(rawText || '').trim();
      const safeRawDetail =
        rawTrimmed && !rawTrimmed.startsWith('<') ? ` (${rawTrimmed.slice(0, 250)})` : '';
      const detalhe = data.detalhe ? ` (${data.detalhe})` : safeRawDetail;
      throw new Error((data.erro || `Erro ao enviar parte ${chunkIndex + 1}/${totalChunks}.`) + detalhe);
    }
  }

  const finalizeResp = await fetch(`${API_BASE_URL}/documentos-modelos/chunk/finalize`, {
    method: 'POST',
    headers: withAuthHeaders({
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      upload_id: uploadId,
      nome,
      original_name: String(file.name || 'modelo.docx'),
    }),
    credentials: 'include',
  });

  const { rawText, data } = await parseResponseBody(finalizeResp);
  if (!finalizeResp.ok) {
    const rawTrimmed = String(rawText || '').trim();
    const safeRawDetail =
      rawTrimmed && !rawTrimmed.startsWith('<') ? ` (${rawTrimmed.slice(0, 250)})` : '';
    const detalhe = data.detalhe ? ` (${data.detalhe})` : safeRawDetail;
    throw new Error((data.erro || 'Erro ao finalizar upload em partes.') + detalhe);
  }
  return data;
}

const api = {
  clientes: {
    list: (params) => apiRequest(`/clientes${buildQuery(params)}`),
    get: (id) => apiRequest(`/clientes/${id}`),
    create: (payload) => apiRequest('/clientes', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) =>
      apiRequest(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => apiRequest(`/clientes/${id}`, { method: 'DELETE' }),
  },
  processos: {
    list: (params) => apiRequest(`/processos${buildQuery(params)}`),
    get: (id) => apiRequest(`/processos/${id}`),
    andamentos: (id) => apiRequest(`/processos/${id}/andamentos`),
    syncAndamentos: (id) => apiRequest(`/processos/${id}/andamentos/sync`, { method: 'POST' }),
    markAndamentosSeen: (id) => apiRequest(`/processos/${id}/andamentos/seen`, { method: 'POST' }),
    andamentosLogs: (id, params) =>
      apiRequest(`/processos/${id}/andamentos/logs${buildQuery(params)}`),
    create: (payload) => apiRequest('/processos', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) =>
      apiRequest(`/processos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => apiRequest(`/processos/${id}`, { method: 'DELETE' }),
  },
  atividades: {
    list: (params) => apiRequest(`/atividades${buildQuery(params)}`),
    get: (id) => apiRequest(`/atividades/${id}`),
    create: (payload) => apiRequest('/atividades', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) =>
      apiRequest(`/atividades/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => apiRequest(`/atividades/${id}`, { method: 'DELETE' }),
  },
  documentos: {
    list: (processoId) => apiRequest(`/documentos?processo_id=${processoId}`),
    upload: async (processoId, file) => {
      const formData = new FormData();
      formData.append('processo_id', processoId);
      formData.append('arquivo', file);

      const response = await fetch(`${API_BASE_URL}/documentos`, {
        method: 'POST',
        headers: withAuthHeaders(),
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detalhe = data.detalhe ? ` (${data.detalhe})` : '';
        const message = (data.erro || 'Erro inesperado.') + detalhe;
        throw new Error(message);
      }
      return data;
    },
    download: async (id, filename) => {
      const response = await fetch(`${API_BASE_URL}/documentos/${id}/download`, {
        headers: withAuthHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.erro || 'Erro ao baixar documento.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'documento';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    remove: (id) => apiRequest(`/documentos/${id}`, { method: 'DELETE' }),
  },
  documentosModelos: {
    list: () => apiRequest('/documentos-modelos'),
    upload: async (nome, file) => {
      const formData = new FormData();
      formData.append('nome', nome);
      formData.append('arquivo', file);

      const response = await fetch(`${API_BASE_URL}/documentos-modelos`, {
        method: 'POST',
        headers: withAuthHeaders(),
        body: formData,
        credentials: 'include',
      });

      const { rawText, data } = await parseResponseBody(response);
      if (!response.ok) {
        if (response.status === 413) {
          return uploadModeloByChunks(nome, file);
        }

        const rawTrimmed = String(rawText || '').trim();
        const safeRawDetail =
          rawTrimmed && !rawTrimmed.startsWith('<') ? ` (${rawTrimmed.slice(0, 300)})` : '';
        const detalhe = data.detalhe ? ` (${data.detalhe})` : safeRawDetail;
        const message = (data.erro || `Erro no upload (${response.status}).`) + detalhe;
        throw new Error(message);
      }
      return data;
    },
    remove: (id) => apiRequest(`/documentos-modelos/${id}`, { method: 'DELETE' }),
    preview: (id, clienteId) =>
      apiRequest(`/documentos-modelos/${id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ cliente_id: clienteId }),
      }),
    downloadPdf: async (id, clienteId, filename) => {
      const response = await fetch(
        `${API_BASE_URL}/documentos-modelos/${id}/pdf?cliente_id=${clienteId}`,
        {
          headers: withAuthHeaders(),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.erro || 'Erro ao baixar PDF.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'documento.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    downloadDocx: async (id, clienteId, filename) => {
      const response = await fetch(
        `${API_BASE_URL}/documentos-modelos/${id}/docx?cliente_id=${clienteId}`,
        {
          headers: withAuthHeaders(),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.erro || 'Erro ao baixar DOCX.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'documento.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  },
  financeiro: {
    listByProcesso: (processoId) => apiRequest(`/processos/${processoId}/financeiro-lancamentos`),
    create: (processoId, payload) =>
      apiRequest(`/processos/${processoId}/financeiro-lancamentos`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    createAvulso: (payload) =>
      apiRequest('/financeiro-lancamentos', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      apiRequest(`/financeiro-lancamentos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id) => apiRequest(`/financeiro-lancamentos/${id}`, { method: 'DELETE' }),
  },
  publicacoesDjen: {
    list: (params) => apiRequest(`/publicacoes-djen${buildQuery(params)}`),
  },
  chat: {
    listConversas: () => apiRequest('/chat/conversas'),
    listColaboradores: () => apiRequest('/chat/colaboradores'),
    criarConversaDireta: (usuarioId) =>
      apiRequest('/chat/conversas/direta', {
        method: 'POST',
        body: JSON.stringify({ usuario_id: usuarioId }),
      }),
    listMensagens: (conversaId, params) =>
      apiRequest(`/chat/conversas/${conversaId}/mensagens${buildQuery(params)}`),
    marcarComoLida: (conversaId) => apiRequest(`/chat/conversas/${conversaId}/ler`, { method: 'POST' }),
    enviarMensagem: async (conversaId, texto, arquivos = []) => {
      const formData = new FormData();
      if (texto !== undefined && texto !== null) {
        formData.append('texto', String(texto));
      }
      (arquivos || []).forEach((arquivo) => {
        formData.append('arquivos', arquivo);
      });

      const response = await fetch(`${API_BASE_URL}/chat/conversas/${conversaId}/mensagens`, {
        method: 'POST',
        headers: withAuthHeaders({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }),
        body: formData,
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.erro || 'Erro ao enviar mensagem.');
      }
      return data;
    },
    downloadAnexo: async (anexoId, filename) => {
      const response = await fetch(`${API_BASE_URL}/chat/anexos/${anexoId}/download`, {
        headers: withAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.erro || 'Erro ao baixar anexo.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'anexo';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  },
  auth: {
    setEscritorio: (escritorioId) => setEscritorioId(escritorioId),
    registerStart: (payload) => apiRequest('/auth/register/start', { method: 'POST', body: JSON.stringify(payload) }),
    registerVerify: (payload) => apiRequest('/auth/register/verify', { method: 'POST', body: JSON.stringify(payload) }),
  },
};
