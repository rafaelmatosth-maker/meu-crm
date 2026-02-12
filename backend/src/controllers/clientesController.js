const db = require('../db');
const { requireFields } = require('../utils/validators');

function getEscritorioId(req) {
  return Number(req.escritorio && req.escritorio.id);
}

async function listar(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const offset = (page - 1) * limit;

    const where = ['escritorio_id = $1'];
    const params = [escritorioId];

    if (req.query.status) {
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      where.push(`(
        unaccent(coalesce(nome, '')) ILIKE unaccent($${params.length})
        OR unaccent(coalesce(email, '')) ILIKE unaccent($${params.length})
        OR telefone ILIKE $${params.length}
        OR cpf ILIKE $${params.length}
      )`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalResult = await db.query(`SELECT COUNT(*) FROM clientes ${whereSql}`, params);
    const total = Number(totalResult.rows[0].count);

    let orderSql = 'ORDER BY created_at DESC';
    if (req.query.sort === 'nome') {
      const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
      orderSql = `ORDER BY LOWER(nome) ${dir}`;
    }

    params.push(limit, offset);
    const result = await db.query(
      `SELECT * FROM clientes ${whereSql} ${orderSql} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ data: result.rows, page, limit, total });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao listar clientes.' });
  }
}

async function obter(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query('SELECT * FROM clientes WHERE id = $1 AND escritorio_id = $2', [
      req.params.id,
      escritorioId,
    ]);
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao obter cliente.' });
  }
}

async function criar(req, res) {
  const missing = requireFields(req.body, ['nome']);
  if (missing.length) {
    return res.status(400).json({ erro: `Campos obrigatórios: ${missing.join(', ')}` });
  }

  const {
    nome,
    cpf,
    telefone,
    email,
    status,
    acesso_gov,
    cep,
    cpf_responsavel,
    cidade,
    dados_bancarios,
    data_chegada,
    data_nascimento,
    endereco,
    numero_casa,
    estado,
    estado_civil,
    filiacao,
    idade,
    link_pasta,
    nacionalidade,
    agencia,
    conta,
    banco,
    tipo_conta,
    parceiro,
    processos_notion,
    profissao,
    qualificacao,
    rg,
    responsavel,
  } = req.body;

  const escritorioId = getEscritorioId(req);
  const statusFinal = status || 'lead';
  if (statusFinal && !['lead', 'ativo', 'inativo'].includes(statusFinal)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }
  try {
    const result = await db.query(
      `INSERT INTO clientes (
        nome,
        cpf,
        telefone,
        email,
        status,
        acesso_gov,
        cep,
        cpf_responsavel,
        cidade,
        dados_bancarios,
        data_chegada,
        data_nascimento,
        endereco,
        numero_casa,
        estado,
        estado_civil,
        filiacao,
        idade,
        link_pasta,
        nacionalidade,
        agencia,
        conta,
        banco,
        tipo_conta,
        parceiro,
        processos_notion,
        profissao,
        qualificacao,
        rg,
        responsavel,
        escritorio_id
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,
        $31
      )
      RETURNING *`,
      [
        nome,
        cpf || null,
        telefone || null,
        email || null,
        statusFinal,
        acesso_gov || null,
        cep || null,
        cpf_responsavel || null,
        cidade || null,
        dados_bancarios || null,
        data_chegada || null,
        data_nascimento || null,
        endereco || null,
        numero_casa || null,
        estado || null,
        estado_civil || null,
        filiacao || null,
        idade || null,
        link_pasta || null,
        nacionalidade || null,
        agencia || null,
        conta || null,
        banco || null,
        tipo_conta || null,
        parceiro || null,
        processos_notion || null,
        profissao || null,
        qualificacao || null,
        rg || null,
        responsavel || null,
        escritorioId,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'CPF ou e-mail já cadastrado.' });
    }
    return res.status(500).json({ erro: 'Erro ao criar cliente.' });
  }
}

async function atualizar(req, res) {
  const allowed = {
    nome: 'nome',
    cpf: 'cpf',
    telefone: 'telefone',
    email: 'email',
    status: 'status',
    acesso_gov: 'acesso_gov',
    cep: 'cep',
    cpf_responsavel: 'cpf_responsavel',
    cidade: 'cidade',
    dados_bancarios: 'dados_bancarios',
    data_chegada: 'data_chegada',
    data_nascimento: 'data_nascimento',
    endereco: 'endereco',
    numero_casa: 'numero_casa',
    estado: 'estado',
    estado_civil: 'estado_civil',
    filiacao: 'filiacao',
    idade: 'idade',
    link_pasta: 'link_pasta',
    nacionalidade: 'nacionalidade',
    agencia: 'agencia',
    conta: 'conta',
    banco: 'banco',
    tipo_conta: 'tipo_conta',
    parceiro: 'parceiro',
    processos_notion: 'processos_notion',
    profissao: 'profissao',
    qualificacao: 'qualificacao',
    rg: 'rg',
    responsavel: 'responsavel',
  };

  const updates = [];
  const values = [];

  Object.entries(allowed).forEach(([key, column]) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      let value = req.body[key];
      if (value === '') value = null;
      if (key === 'status' && value && !['lead', 'ativo', 'inativo'].includes(value)) {
        return;
      }
      if (key === 'nome' && !value) {
        value = null;
      }
      updates.push(`${column} = $${values.length + 1}`);
      values.push(value);
    }
  });

  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    const status = req.body.status;
    if (status && !['lead', 'ativo', 'inativo'].includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'nome') && !req.body.nome) {
    return res.status(400).json({ erro: 'Campo obrigatório: nome' });
  }

  const escritorioId = getEscritorioId(req);
  values.push(req.params.id, escritorioId);

  try {
    const result = await db.query(
      `UPDATE clientes
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND escritorio_id = $${values.length}
       RETURNING *`,
      values
    );
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ erro: 'CPF ou e-mail já cadastrado.' });
    }
    return res.status(500).json({ erro: 'Erro ao atualizar cliente.' });
  }
}

async function remover(req, res) {
  try {
    const escritorioId = getEscritorioId(req);
    const result = await db.query('DELETE FROM clientes WHERE id = $1 AND escritorio_id = $2 RETURNING id', [
      req.params.id,
      escritorioId,
    ]);
    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    return res.json({ mensagem: 'Cliente removido.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao remover cliente.' });
  }
}

module.exports = {
  listar,
  obter,
  criar,
  atualizar,
  remover,
};
