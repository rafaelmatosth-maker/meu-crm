-- Seed inicial do Meu CRM

INSERT INTO usuarios (nome, email, senha_hash)
VALUES (
  'Administrador',
  'admin@local.dev',
  '$2a$10$Sz.uXvgCSvHPvn7FSfqEwuMGnfy.rl4TrhRPgl53fodHovUM8JmpS'
);

INSERT INTO escritorios (nome, slug)
VALUES ('Escritorio Principal', 'escritorio-principal');

INSERT INTO membros_escritorio (escritorio_id, usuario_id, papel)
VALUES (1, 1, 'owner');

INSERT INTO clientes (escritorio_id, nome, cpf, telefone, email, status)
VALUES
  (1, 'Ana Souza', '123.456.789-10', '(11) 90000-0001', 'ana@exemplo.com', 'ativo'),
  (1, 'Bruno Lima', NULL, '(11) 90000-0002', 'bruno@exemplo.com', 'lead'),
  (1, 'Carla Alves', '987.654.321-00', '(11) 90000-0003', 'carla@exemplo.com', 'inativo');

INSERT INTO processos (escritorio_id, cliente_id, numero_processo, area, fase, status, orgao)
VALUES
  (1, 1, '0001234-56.2024.8.26.0100', 'Cível', 'Inicial', 'Em andamento', 'TJSP'),
  (1, 2, '0009876-54.2023.8.26.0100', 'Trabalhista', 'Audiência', 'Pendente', 'TRT-2'),
  (1, 3, '0001111-22.2022.8.26.0100', 'Família', 'Sentença', 'Concluído', 'TJSP');

INSERT INTO atividades (escritorio_id, processo_id, responsavel_id, titulo, descricao, status, prioridade, prazo, concluida_em)
VALUES
  (1, 1, 1, 'Revisar documentos', 'Analisar petições e anexos do cliente.', 'a_fazer', 'alta', '2026-02-20', NULL),
  (1, 1, 1, 'Agendar reunião', 'Marcar alinhamento inicial com o cliente.', 'fazendo', 'media', '2026-02-15', NULL),
  (1, 2, 1, 'Preparar defesa', 'Elaborar minuta da defesa.', 'a_fazer', 'alta', '2026-02-28', NULL),
  (1, 2, 1, 'Protocolar documentos', 'Enviar documentos ao tribunal.', 'feito', 'media', '2026-01-20', '2026-01-18 10:00:00'),
  (1, 3, 1, 'Atualizar cliente', 'Enviar atualização de andamento.', 'cancelado', 'baixa', NULL, NULL),
  (1, 3, 1, 'Encerrar processo', 'Finalizar e arquivar documentação.', 'feito', 'alta', '2025-12-10', '2025-12-09 15:30:00');
