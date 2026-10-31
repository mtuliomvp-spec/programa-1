# Próximos passos — venda do Fincore360

Anotado em 30/10/2026, para retomar deste ponto.

## Onde paramos

Próximo passo: **criar a conta do Google Ads da Fincore360**, separada da conta da
MVP (809-803-7592), em nome do **CNPJ da Fincore**.

1. ads.google.com → ícone (M) → **"Nova conta do Google Ads"**.
2. Se oferecer campanha guiada: **"Mudar para o modo especialista"** /
   **"Criar uma conta sem uma campanha"**.
3. País Brasil, fuso de Brasília, moeda **BRL** (não muda depois).
4. Pagamento: tipo **Empresa**, razão social e CNPJ da Fincore, de preferência
   cartão PJ (digitado só na tela do Google).
5. Depois: campanha de Pesquisa com os textos do layout do anúncio, conversão
   "pedido de assinatura" e verificação do anunciante como empresa.

## O que já está pronto

- Página de venda: **programa-1-demo.vercel.app/assinar** (só no demo).
  - Dois planos, o mesmo sistema: **Essencial R$ 399/mês** (150 leituras de
    documento) e **Completo R$ 599/mês** (500 leituras). Excedente de R$ 0,40
    por leitura. Implantação de R$ 790, **grátis para pedidos até 15/11/2026**
    (a página volta a cobrar sozinha depois da data).
  - O pedido grava o plano escolhido; o Painel Super Admin mostra o plano e se
    a implantação é grátis.
  - Formulário "Solicite seu acesso": os pedidos aparecem no Painel Super
    Admin do demo.
  - Botão "Testar o sistema": entra no demo como visitante compartilhado. Não
    tem Renave, NF-e, NFS-e nem as telas de administrador.
  - Política de privacidade em /assinar/privacidade.
- Layout do anúncio, com títulos, descrições, sitelinks e banners. URL final:
  `https://programa-1-demo.vercel.app/assinar`.
- Nome da loja: vem de Parâmetros (nome fantasia) em todas as telas, nos e-mails,
  no PDF e na vitrine. Slogan da vitrine também é um campo de Parâmetros.

## APIs: o que a Fincore paga e o que a loja contrata

Está na página /assinar, seção "O que está incluído e o que a loja contrata".

Incluído na mensalidade (contas da Fincore):
- Hospedagem e banco (Vercel + Neon), backup e atualizações.
- IA de leitura de documentos (Anthropic): franquia de 150 (Essencial) ou 500
  (Completo) por mês, excedente de R$ 0,40.
- E-mail do sistema (Brevo).
- CEP (ViaCEP), CNPJ (BrasilAPI) e FIPE pública (parallelum): gratuitas.

Contratado pela loja, pago direto ao fornecedor:
- Certificado digital e-CNPJ A1 (obrigatório para o Renave).
- Adesão e contrato da loja com o SERPRO para o Renave.
- Focus NFe (opcional, só para emitir NF-e/NFS-e pelo sistema).
- Consulta por placa e débitos, ex.: wdapi2 (opcional). O token vai em
  Parâmetros › Consulta por placa.
- Domínio próprio e Google Ads (opcional).

No anúncio: a descrição 3 diz "Planos de R$ 399 e R$ 599/mês. Certificado
digital e emissor de notas à parte".

Preço comparado com o mercado (31/10/2026): planos completos dos concorrentes
ficam entre R$ 549 e R$ 799 por mês (Simples Veículo, GestorCar, Velix), e os
de entrada entre R$ 120 e R$ 400. Vários incluem a NF-e, que no Fincore é à
parte; por isso o plano de entrada.

## Pendências

- [ ] **16/11/2026:** no Google Ads, pausar o título "Implantação Grátis até
      15/11" e a frase de destaque da promoção; trocar os banners.

- [ ] Recarregar os dados do demo de vez em quando (/demo), porque os
      visitantes mexem nos dados.
- [ ] Contador: confirmar o anexo do Simples Nacional da Fincore (6% ou 15,5%).
- [ ] Contrato de assinatura e termos de uso, revisados por advogado.
- [ ] Definir como cobrar a mensalidade (Pix ou boleto recorrente).
- [ ] Vercel Pro, porque o plano gratuito não permite uso comercial.
- [ ] Configurar um provedor de e-mail no demo (Brevo), para os pedidos chegarem
      no e-mail.
- [ ] Opcional: domínio próprio para o Fincore360.

## Campanha da MVP (acompanhar)

- [ ] Status da campanha "Seminovos São Luís": de Pendente para Qualificada.
- [ ] Conversão "WhatsApp vitrine" registrando.
- [ ] Revisar os Termos de pesquisa em 3 a 5 dias.
- [ ] Apagar o rascunho antigo ("Rascunhos em andamento: 1").
- [ ] Unificar os dois números de WhatsApp da loja.
- [ ] Perfil da Empresa no Google: aguardar a análise do novo alfinete (até 7 dias).
- [ ] Trocar o token da consulta por placa (wdapi2: "Token Invalido").
