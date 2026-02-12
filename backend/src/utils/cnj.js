function parseCnjNumber(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 20) return null;

  return {
    sequencial: digits.slice(0, 7),
    dv: digits.slice(7, 9),
    ano: digits.slice(9, 13),
    j: digits.slice(13, 14),
    tr: digits.slice(14, 16),
    oooo: digits.slice(16, 20),
  };
}

function formatCnjNumber(parts) {
  if (!parts) return null;
  const { sequencial, dv, ano, j, tr, oooo } = parts;
  if (!sequencial || !dv || !ano || !j || !tr || !oooo) return null;
  return `${sequencial}-${dv}.${ano}.${j}.${tr}.${oooo}`;
}

function formatCnjDigits(parts) {
  if (!parts) return null;
  const { sequencial, dv, ano, j, tr, oooo } = parts;
  if (!sequencial || !dv || !ano || !j || !tr || !oooo) return null;
  return `${sequencial}${dv}${ano}${j}${tr}${oooo}`;
}

const ufByTr = {
  '01': 'AC',
  '02': 'AL',
  '03': 'AP',
  '04': 'AM',
  '05': 'BA',
  '06': 'CE',
  '07': 'DF',
  '08': 'ES',
  '09': 'GO',
  '10': 'MA',
  '11': 'MG',
  '12': 'MS',
  '13': 'MT',
  '14': 'PA',
  '15': 'PB',
  '16': 'PR',
  '17': 'PE',
  '18': 'PI',
  '19': 'RJ',
  '20': 'RN',
  '21': 'RS',
  '22': 'RO',
  '23': 'RR',
  '24': 'SC',
  '25': 'SE',
  '26': 'SP',
  '27': 'TO',
};

function tribunalAliasFromCnj(parts) {
  if (!parts) return null;
  const j = String(parts.j);
  const tr = String(parts.tr).padStart(2, '0');

  if (j === '4') return `trf${Number(tr)}`;
  if (j === '5') return `trt${Number(tr)}`;
  if (j === '8') {
    const uf = ufByTr[tr];
    if (!uf) return null;
    if (uf === 'DF') return 'tjdft';
    return `tj${uf.toLowerCase()}`;
  }
  return null;
}

module.exports = {
  parseCnjNumber,
  formatCnjNumber,
  formatCnjDigits,
  tribunalAliasFromCnj,
};
