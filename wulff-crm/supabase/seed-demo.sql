-- ============================================================================
-- WULFF RELATIONSHIP CRM — DADOS DE DEMONSTRAÇÃO (100% FICTÍCIOS)
--
-- Execute DEPOIS do schema.sql e DEPOIS de criar sua conta na aplicação.
-- O script vincula os dados ao primeiro usuário cadastrado.
-- Nenhum dado real é utilizado aqui (Seções 0 e 31 da especificação).
-- ============================================================================

do $$
declare
  uid uuid;
  comp_ids uuid[] := array[]::uuid[];
  inserted_contacts int;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'Crie sua conta na aplicação antes de rodar o seed de demonstração.';
  end if;

  -- ------------------------------------------------------------------ tags
  insert into tags (user_id, name, group_name) values
    (uid,'Reforma Tributária','Temas'),(uid,'Tributário','Temas'),(uid,'Tecnologia','Temas'),
    (uid,'IA','Temas'),(uid,'Agronegócio','Setores'),(uid,'Indústria','Setores'),
    (uid,'Varejo','Setores'),(uid,'Investidores','Rede'),(uid,'Golfe','Pessoal'),
    (uid,'Vinhos','Pessoal'),(uid,'Eventos','Rede'),(uid,'Internacional','Rede'),
    (uid,'Porto Alegre','Cidades'),(uid,'São Paulo','Cidades'),(uid,'Cliente VIP','Rede')
  on conflict (user_id, name) do nothing;

  -- ------------------------------------------------------------- empresas (10)
  with new_companies as (
    insert into companies (user_id, trade_name, legal_name, segment, size, city, state, country, status, website)
    values
      (uid,'Aurora Alimentos Demo','Aurora Alimentos Demo Ltda','Indústria de alimentos','Grande','Chapecó','SC','Brasil','ativa','https://exemplo-aurora.com.br'),
      (uid,'Vetra Tech Demo','Vetra Tecnologia Demo S.A.','Software B2B','Média','São Paulo','SP','Brasil','ativa','https://exemplo-vetra.com.br'),
      (uid,'Horizonte Advogados Demo','Horizonte Sociedade de Advogados Demo','Jurídico','Média','Porto Alegre','RS','Brasil','ativa',null),
      (uid,'Campo Verde Agro Demo','Campo Verde Agronegócios Demo Ltda','Agronegócio','Grande','Sorriso','MT','Brasil','ativa',null),
      (uid,'Contadoria Prisma Demo','Prisma Contabilidade Demo Ltda','Contabilidade','Pequena','Porto Alegre','RS','Brasil','ativa',null),
      (uid,'Banco Meridional Demo','Banco Meridional Demo S.A.','Serviços financeiros','Multinacional','São Paulo','SP','Brasil','ativa',null),
      (uid,'Lume Varejo Demo','Lume Comércio Demo S.A.','Varejo','Grande','Curitiba','PR','Brasil','prospect',null),
      (uid,'Andes Partners Demo','Andes Partners Demo LLC','Investimentos','Média','Buenos Aires',null,'Argentina','ativa',null),
      (uid,'Instituto Saber Demo','Instituto Saber Demo','Educação','Pequena','Florianópolis','SC','Brasil','ativa',null),
      (uid,'Global Foods Demo','Global Foods Demo Inc.','Alimentos','Multinacional','Miami',null,'Estados Unidos','ativa',null)
    returning id
  )
  select array_agg(id) into comp_ids from new_companies;

  -- ------------------------------------------------------------- contatos (32)
  with new_contacts as (
    insert into contacts (
      user_id, full_name, preferred_name, job_title, company_name, company_id,
      city, state, country, email, phone, whatsapp, linkedin,
      closeness, importance, influence, business_potential, trust_level,
      relationship_status, how_we_met, introduced_by, origin_context,
      birth_date, birth_day, birth_month, interests, hobbies,
      next_contact_date, contact_frequency, opportunities, source
    ) values
      (uid,'Helena Castilhos','Helena','CEO','Aurora Alimentos Demo',comp_ids[1],'Chapecó','SC','Brasil','helena.castilhos@exemplo-aurora.com.br','+554999110001','+554999110001','linkedin.com/in/helena-demo',1,5,5,4,5,'ativo','Fórum de líderes do agronegócio','','FÓRUM AGRO 2019','1972-04-18',18,4,'Reforma tributária, expansão internacional','Golfe, vinhos tintos',current_date + 5,'mensal','Projeto de reestruturação tributária em análise','demo'),
      (uid,'Ricardo Vasconcelos','Ricardo','Sócio-fundador','Vetra Tech Demo',comp_ids[2],'São Paulo','SP','Brasil','ricardo@exemplo-vetra.com.br','+5511988220002',null,'linkedin.com/in/ricardo-demo',1,5,4,5,4,'ativo','Apresentado por investidor em comum','Marina Duarte','Demo Day 2021','1980-09-02',2,9,'IA aplicada, venture capital','Corrida de rua',current_date + 12,'mensal','Possível parceria em produto de IA fiscal','demo'),
      (uid,'Marina Duarte','Marina','Managing Partner','Andes Partners Demo',comp_ids[8],'Buenos Aires',null,'Argentina','marina.duarte@exemplo-andes.com','+5491144330003',null,'linkedin.com/in/marina-demo',2,5,5,3,4,'ativo','Conferência de investimentos','','LATAM INVEST 2018','1975-11-25',25,11,'M&A, mercados emergentes','Vinhos, arte',current_date + 20,'trimestral',null,'demo'),
      (uid,'Dr. Otávio Linhares','Otávio','Sócio','Horizonte Advogados Demo',comp_ids[3],'Porto Alegre','RS','Brasil','otavio@exemplo-horizonte.adv.br','+5551999440004','+5551999440004',null,2,4,4,2,5,'ativo','Colega de faculdade','','UFRGS','1970-02-14',14,2,'Direito tributário, arbitragem','Xadrez, história',current_date + 8,'bimestral',null,'demo'),
      (uid,'Beatriz Fontana','Bia','Diretora Financeira','Aurora Alimentos Demo',comp_ids[1],'Chapecó','SC','Brasil','beatriz.fontana@exemplo-aurora.com.br','+554999550005',null,null,3,4,3,4,4,'ativo','Indicada pela CEO','Helena Castilhos','Projeto 2020',null,7,7,'Planejamento tributário','Culinária',current_date + 30,'trimestral','Renovação de contrato anual','demo'),
      (uid,'Fernando Sarmento','Fernando','Contador-chefe','Contadoria Prisma Demo',comp_ids[5],'Porto Alegre','RS','Brasil','fernando@exemplo-prisma.cnt.br','+5551998660006','+5551998660006',null,3,3,2,3,5,'ativo','Parceiro de longa data','','Indicação 2015','1968-12-03',3,12,'SPED, reforma tributária',null,current_date - 2,'mensal',null,'demo'),
      (uid,'Camila Antunes','Camila','Diretora de Compras','Lume Varejo Demo',comp_ids[7],'Curitiba','PR','Brasil','camila.antunes@exemplo-lume.com.br','+5541997770007',null,'linkedin.com/in/camila-demo',4,4,3,5,3,'ativo','Prospecção ativa','','Feira do Varejo 2024',null,22,3,'Eficiência fiscal no varejo',null,current_date + 3,'mensal','Proposta comercial enviada — aguardando retorno','demo'),
      (uid,'Gustavo Pereira Lima','Gustavo','Diretor de TI','Banco Meridional Demo',comp_ids[6],'São Paulo','SP','Brasil','gustavo.lima@exemplo-meridional.com.br','+5511987880008',null,null,4,3,3,3,3,'ativo','Evento de tecnologia','Ricardo Vasconcelos','TechBank 2022','1983-06-30',30,6,'Open finance, IA','Games, fotografia',null,'semestral',null,'demo'),
      (uid,'Profa. Lúcia Meirelles','Lúcia','Professora titular','Instituto Saber Demo',comp_ids[9],'Florianópolis','SC','Brasil','lucia.meirelles@exemplo-saber.edu.br','+5548996990009',null,null,3,3,4,1,5,'ativo','Banca de mestrado','','Academia','1965-08-11',11,8,'Educação executiva, economia','Literatura',current_date + 45,'semestral',null,'demo'),
      (uid,'John Whitaker','John','VP Latin America','Global Foods Demo',comp_ids[10],'Miami',null,'Estados Unidos','john.whitaker@exemplo-globalfoods.com','+13055551010',null,'linkedin.com/in/john-demo',5,4,4,4,3,'enfraquecendo','Missão empresarial aos EUA','Helena Castilhos','Missão 2019','1971-01-22',22,1,'Expansão LATAM','Golfe',null,'trimestral',null,'demo'),
      (uid,'Sofia Rezende','Sofia','Jornalista de economia',null,null,'São Paulo','SP','Brasil','sofia.rezende@exemplo-imprensa.com.br','+5511976121011',null,null,5,2,4,1,3,'ativo','Entrevista sobre reforma tributária','','Imprensa 2023',null,15,5,'Economia, política fiscal',null,null,null,null,'demo'),
      (uid,'Deputado André Bittar','André','Deputado Federal',null,null,'Brasília','DF','Brasil',null,'+5561981231012',null,null,5,4,5,1,2,'ativo','Audiência pública','Dr. Otávio Linhares','Audiência 2022','1969-10-05',5,10,'Política tributária',null,null,'anual',null,'demo'),
      (uid,'Paulo Cesar Andrade','Paulo','Empresário — construção civil',null,null,'Porto Alegre','RS','Brasil','paulo.andrade@exemplo-pca.com.br','+5551997341013','+5551997341013',null,3,4,3,4,4,'ativo','Clube de golfe','','Golfe',null,9,6,'Incorporação, funding','Golfe, náutica',current_date - 10,'bimestral','Estudo de regime tributário para nova incorporadora','demo'),
      (uid,'Renata Kovalski','Renata','Head de RH','Vetra Tech Demo',comp_ids[2],'São Paulo','SP','Brasil','renata.k@exemplo-vetra.com.br',null,null,null,6,2,2,1,3,'inativo','Processo seletivo conjunto','Ricardo Vasconcelos','2021',null,null,null,null,null,null,null,null,'demo'),
      (uid,'Tomás Iglesias','Tomás','Investidor-anjo',null,null,'Montevidéu',null,'Uruguai','tomas.iglesias@exemplo-inv.com','+59899451014',null,'linkedin.com/in/tomas-demo',4,4,4,4,3,'ativo','Rodada de investimento','Marina Duarte','Pitch 2022','1978-03-08',8,3,'Startups B2B, fintechs','Vela',current_date + 15,'trimestral',null,'demo'),
      (uid,'Isabela Martins','Isa','Advogada tributarista','Horizonte Advogados Demo',comp_ids[3],'Porto Alegre','RS','Brasil','isabela.martins@exemplo-horizonte.adv.br','+5551996561015','+5551996561015',null,4,3,2,2,4,'ativo','Equipe do Dr. Otávio','Dr. Otávio Linhares','2020',null,28,2,'Contencioso tributário',null,null,null,null,'demo'),
      (uid,'Cláudio Bernardes','Cláudio','Ex-CFO (aposentado)',null,null,'Gramado','RS','Brasil','claudio.bernardes@exemplo-mail.com','+5554991671016',null,null,6,2,3,1,5,'inativo','Ex-cliente histórico','','Projeto 2012','1955-05-17',17,5,'Vinhos, montanhismo','Vinhos',null,null,null,'demo'),
      (uid,'Yuki Tanaka','Yuki','Trade Director','Global Foods Demo',comp_ids[10],'Tóquio',null,'Japão','yuki.tanaka@exemplo-globalfoods.com',null,null,null,7,3,3,2,2,'ativo','Rodada de negócios internacional','John Whitaker','Missão Ásia 2023',null,null,null,'Exportação de proteína',null,null,'anual',null,'demo'),
      (uid,'Vera Lúcia Prates','Vera','Diretora de Sustentabilidade','Campo Verde Agro Demo',comp_ids[4],'Sorriso','MT','Brasil','vera.prates@exemplo-campoverde.agr.br','+5566996781017',null,null,4,3,3,3,3,'ativo','Painel ESG','Helena Castilhos','ESG Summit 2023',null,2,11,'ESG, crédito de carbono',null,current_date + 25,'trimestral',null,'demo'),
      (uid,'Eduardo Feltrin','Edu','Sócio-diretor','Campo Verde Agro Demo',comp_ids[4],'Sorriso','MT','Brasil','eduardo.feltrin@exemplo-campoverde.agr.br','+5566998891018','+5566998891018','linkedin.com/in/edu-demo',2,5,4,5,4,'ativo','Cliente desde 2017','Fernando Sarmento','Indicação','1976-07-19',19,7,'Funrural, sucessão familiar','Pesca esportiva',current_date + 1,'mensal','Planejamento sucessório da holding familiar','demo'),
      (uid,'Patrícia Salles','Pati','Consultora independente',null,null,'Rio de Janeiro','RJ','Brasil','patricia.salles@exemplo-consult.com.br','+5521995901019',null,null,5,2,3,2,3,'ativo','Projeto conjunto em cliente','Beatriz Fontana','2022',null,4,4,'Gestão de mudanças',null,null,null,null,'demo'),
      (uid,'Miguel Arruda','Miguel','Prefeito (ex)',null,null,'Caxias do Sul','RS','Brasil',null,'+5554992011020',null,null,6,3,4,1,2,'inativo','Evento público','','2018',null,null,null,null,null,null,null,null,'demo'),
      (uid,'Aline Sperotto','Aline','Gerente de Novos Negócios','Lume Varejo Demo',comp_ids[7],'Curitiba','PR','Brasil','aline.sperotto@exemplo-lume.com.br','+5541998121021',null,null,5,3,2,4,3,'ativo','Contato da diretora de compras','Camila Antunes','2024',null,12,12,'Expansão de lojas',null,current_date + 6,'mensal',null,'demo'),
      (uid,'Bruno Sganzerla','Bruno','CTO','Vetra Tech Demo',comp_ids[2],'São Paulo','SP','Brasil','bruno@exemplo-vetra.com.br',null,'+5511983231022',null,4,3,2,3,4,'ativo','Time do Ricardo','Ricardo Vasconcelos','2021','1988-11-09',9,11,'Arquitetura de software, IA',null,null,null,null,'demo'),
      (uid,'Carmem Zanchet','Carmem','Presidente de associação',null,null,'Porto Alegre','RS','Brasil','carmem@exemplo-assoc.org.br','+5551997451023',null,null,3,4,5,2,4,'ativo','Diretoria da associação empresarial','','Associação','1963-09-27',27,9,'Ambiente de negócios, advocacy','Ópera',current_date + 10,'bimestral',null,'demo'),
      (uid,'Diego Fagundes','Diego','Palestrante e autor',null,null,'Florianópolis','SC','Brasil','diego@exemplo-palestras.com.br','+5548999671024',null,'linkedin.com/in/diego-demo',5,2,4,1,3,'ativo','Palestra em evento interno','Profa. Lúcia Meirelles','Convenção 2023',null,1,6,'Liderança, futuro do trabalho',null,null,null,null,'demo'),
      (uid,'Elisa Wagner','Elisa','Amiga de família',null,null,'Porto Alegre','RS','Brasil','elisa.wagner@exemplo-mail.com','+5551991781025','+5551991781025',null,2,2,1,1,5,'ativo','Amizade de infância','','Família','1974-06-08',8,6,null,'Tênis, viagens',null,'semestral',null,'demo'),
      (uid,'Henrique Sattler','Henrique','Diretor Comercial','Banco Meridional Demo',comp_ids[6],'São Paulo','SP','Brasil','henrique.sattler@exemplo-meridional.com.br','+5511984891026',null,null,3,4,3,4,3,'enfraquecendo','Gerente da conta corporativa','','Banco','1979-01-31',31,1,'Crédito corporativo','Maratonas',current_date - 20,'bimestral','Renegociação de linha de crédito','demo'),
      (uid,'Natália Fiorentino','Nati','Sommelière e empresária',null,null,'Bento Gonçalves','RS','Brasil','natalia@exemplo-vinhos.com.br','+5554999891027',null,null,4,2,2,2,4,'ativo','Confraria de vinhos','Cláudio Bernardes','Confraria',null,30,10,'Vinhos, enoturismo','Vinhos',null,'anual',null,'demo'),
      (uid,'Osmar Trindade','Osmar','Fornecedor de TI',null,null,'Porto Alegre','RS','Brasil','osmar@exemplo-fornecedor.com.br','+5551993901028',null,null,5,2,1,2,3,'ativo','Fornecedor há 8 anos','','Fornecedor',null,null,null,null,null,null,null,null,'demo'),
      (uid,'Larissa Campello','Lari','Head Jurídico','Aurora Alimentos Demo',comp_ids[1],'Chapecó','SC','Brasil','larissa.campello@exemplo-aurora.com.br','+554998011029',null,null,4,3,2,3,4,'ativo','Contraparte no projeto','Helena Castilhos','Projeto 2021',null,18,8,'Compliance, contratos',null,null,null,null,'demo'),
      (uid,'Waldir Espíndola','Waldir','Empresário — transportes',null,null,'Cuiabá','MT','Brasil',null,'+5565992121030','+5565992121030',null,6,3,2,3,2,'ativo','Conhecido em viagem de negócios','Eduardo Feltrin','Viagem MT 2022',null,25,7,'Logística',null,null,null,null,'demo'),
      (uid,'Greta Hoffmann','Greta','Executiva de M&A',null,null,'Munique',null,'Alemanha','greta.hoffmann@exemplo-ma.de',null,null,'linkedin.com/in/greta-demo',7,3,4,3,2,'ativo','Conferência internacional','Marina Duarte','M&A Forum 2024',null,14,2,'Cross-border M&A',null,null,null,null,'demo')
    returning id
  )
  select count(*) into inserted_contacts from new_contacts;
  raise notice '% contatos de demonstração criados', inserted_contacts;

  -- categorias dos contatos (amostra representativa)
  insert into contact_categories (contact_id, category_id, user_id)
  select c.id, cat.id, uid
  from contacts c
  join categories cat on cat.user_id = uid
  where c.user_id = uid and c.source = 'demo' and (
    (cat.name = 'Cliente' and c.company_name in ('Aurora Alimentos Demo','Campo Verde Agro Demo'))
    or (cat.name = 'Prospect' and c.company_name = 'Lume Varejo Demo')
    or (cat.name = 'Parceiro' and c.company_name in ('Vetra Tech Demo','Contadoria Prisma Demo'))
    or (cat.name = 'Advogado' and c.job_title ilike '%advoga%' or cat.name = 'Advogado' and c.job_title ilike '%sócio%' and c.company_name = 'Horizonte Advogados Demo')
    or (cat.name = 'Contador' and c.job_title ilike '%contador%')
    or (cat.name = 'Investidor' and c.job_title ilike '%invest%')
    or (cat.name = 'Executivo' and c.job_title ilike any(array['%diretor%','%vp%','%head%','%cto%','%ceo%','%cfo%']))
    or (cat.name = 'Empresário' and c.job_title ilike '%empresári%')
    or (cat.name = 'Professor' and c.job_title ilike '%professor%')
    or (cat.name = 'Palestrante' and c.job_title ilike '%palestrante%')
    or (cat.name = 'Autoridade pública' and (c.job_title ilike '%deputado%' or c.job_title ilike '%prefeito%'))
    or (cat.name = 'Imprensa' and c.job_title ilike '%jornalista%')
    or (cat.name = 'Amigo' and c.job_title ilike '%amig%')
    or (cat.name = 'Fornecedor' and c.job_title ilike '%fornecedor%')
    or (cat.name = 'Contato internacional' and c.country <> 'Brasil')
  )
  on conflict do nothing;

  -- tags de contatos
  insert into contact_tags (contact_id, tag_id, user_id)
  select c.id, t.id, uid
  from contacts c
  join tags t on t.user_id = uid
  where c.user_id = uid and c.source = 'demo' and (
    (t.name = 'Reforma Tributária' and c.interests ilike '%tribut%')
    or (t.name = 'Vinhos' and (c.hobbies ilike '%vinho%' or c.interests ilike '%vinho%'))
    or (t.name = 'Golfe' and c.hobbies ilike '%golfe%')
    or (t.name = 'IA' and c.interests ilike '%ia%')
    or (t.name = 'Agronegócio' and c.company_name = 'Campo Verde Agro Demo')
    or (t.name = 'Varejo' and c.company_name = 'Lume Varejo Demo')
    or (t.name = 'Investidores' and c.job_title ilike '%invest%')
    or (t.name = 'Internacional' and c.country <> 'Brasil')
    or (t.name = 'Porto Alegre' and c.city = 'Porto Alegre')
    or (t.name = 'São Paulo' and c.city = 'São Paulo')
    or (t.name = 'Cliente VIP' and c.closeness = 1)
  )
  on conflict do nothing;

  -- ------------------------------------------------------------ interações
  insert into interactions (user_id, contact_id, kind, summary, description, occurred_at, next_action)
  select uid, c.id, x.kind, x.summary, x.description, now() - (x.days_ago || ' days')::interval, x.next_action
  from contacts c
  join lateral (
    values
      ('reuniao','Reunião de alinhamento estratégico','Discutimos os próximos passos do projeto e o cenário da reforma tributária.', (5 + (abs(hashtext(c.full_name)) % 20))::int, 'Enviar resumo executivo'),
      ('ligacao','Ligação de acompanhamento','Follow-up rápido sobre pendências.', (30 + (abs(hashtext(c.full_name)) % 40))::int, null),
      ('almoco','Almoço de relacionamento','Conversa aberta sobre negócios e família.', (70 + (abs(hashtext(c.full_name)) % 90))::int, null)
  ) as x(kind, summary, description, days_ago, next_action) on true
  where c.user_id = uid and c.source = 'demo'
    and c.closeness is not null and c.closeness <= 3;

  insert into interactions (user_id, contact_id, kind, summary, occurred_at)
  select uid, c.id, 'email', 'Troca de e-mails sobre oportunidade', now() - interval '200 days'
  from contacts c
  where c.user_id = uid and c.source = 'demo' and c.relationship_status = 'enfraquecendo';

  insert into interactions (user_id, contact_id, company_id, kind, summary, occurred_at)
  select uid, c.id, c.company_id, 'proposta', 'Proposta comercial apresentada', now() - interval '15 days'
  from contacts c
  where c.user_id = uid and c.source = 'demo' and c.opportunities is not null;

  -- ------------------------------------------------------------- lembretes
  insert into reminders (user_id, contact_id, title, reason, due_date, recurrence, priority, channel)
  select uid, c.id, 'Retomar contato com ' || split_part(c.full_name,' ',1),
         'Cadência de relacionamento', c.next_contact_date,
         coalesce(c.contact_frequency,'nenhuma'),
         case when c.importance >= 4 then 'alta' else 'media' end,
         case when c.whatsapp is not null then 'whatsapp' else 'email' end
  from contacts c
  where c.user_id = uid and c.source = 'demo' and c.next_contact_date is not null;

  insert into reminders (user_id, contact_id, title, reason, due_date, priority, channel)
  select uid, c.id, 'Parabenizar pelo aniversário', 'Aniversário', current_date + 2, 'media', 'whatsapp'
  from contacts c
  where c.user_id = uid and c.source = 'demo' and c.birth_month is not null
  limit 3;

  -- ---------------------------------------------------------------- notas
  insert into notes (user_id, contact_id, title, body, is_pinned)
  select uid, c.id, 'Resumo executivo',
    'Quem é: ' || c.full_name || ', ' || coalesce(c.job_title,'') ||
    '. Por que é importante: relacionamento ' || coalesce(closenessdesc.d,'') ||
    '. Interesses: ' || coalesce(c.interests,'—') || '. Próxima melhor ação: manter cadência.',
    true
  from contacts c
  join lateral (select case c.closeness when 1 then 'estratégico' when 2 then 'muito próximo' else 'ativo' end as d) closenessdesc on true
  where c.user_id = uid and c.source = 'demo' and c.closeness <= 2;

  insert into notes (user_id, contact_id, title, body, is_private)
  select uid, c.id, 'Preferências pessoais',
    'Prefere reuniões pela manhã. Lembrar de perguntar sobre a família. Hobbies: ' || coalesce(c.hobbies,'—'), true
  from contacts c
  where c.user_id = uid and c.source = 'demo' and c.hobbies is not null
  limit 5;

  -- ------------------------------------------------------- relacionamentos
  insert into relationships (user_id, from_contact_id, to_contact_id, kind, notes)
  select uid, a.id, b.id, 'apresentou', 'Apresentação registrada na origem do contato'
  from contacts a
  join contacts b on b.user_id = uid and b.source = 'demo' and b.introduced_by = a.full_name
  where a.user_id = uid and a.source = 'demo'
  on conflict do nothing;

  insert into relationships (user_id, from_contact_id, to_contact_id, kind)
  select uid, a.id, b.id, 'trabalha_com'
  from contacts a
  join contacts b on b.user_id = uid and b.source = 'demo'
    and b.company_name = a.company_name and b.id > a.id
  where a.user_id = uid and a.source = 'demo' and a.company_name is not null
  on conflict do nothing;

  -- ------------------------------------------------------- vínculos empresa
  insert into contact_companies (user_id, contact_id, company_id, job_title, is_current)
  select uid, c.id, c.company_id, c.job_title, true
  from contacts c
  where c.user_id = uid and c.source = 'demo' and c.company_id is not null;

  -- --------------------------------------------------------------- eventos
  insert into events (user_id, name, event_date, city, country, description) values
    (uid,'FÓRUM AGRO 2019','2019-08-15','Chapecó','Brasil','Fórum de líderes do agronegócio'),
    (uid,'LATAM INVEST 2018','2018-05-10','Buenos Aires','Argentina','Conferência de investimentos'),
    (uid,'ESG Summit 2023','2023-09-20','São Paulo','Brasil','Painel de sustentabilidade');

  raise notice 'Seed de demonstração concluído para o usuário %', uid;
end $$;
