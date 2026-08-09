import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import ImportNfForm from "./ImportNfForm";

export const dynamic = "force-dynamic";
// A leitura de cada nota chama a IA e pode levar alguns segundos.
export const maxDuration = 300;

export default async function ImportarNfPage() {
  await requireAction("compras", "criar");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Importar notas fiscais"
        description="XML, PDF ou foto: o sistema lê a nota e cria a solicitação preenchida — falta só a placa"
        action={
          <LinkButton href="/compras" variant="secondary">
            ← Voltar às solicitações
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p>
            Envie o <strong>XML</strong> da nota, o PDF ou uma foto. O sistema lê e cria uma{" "}
            <strong>solicitação de compra por nota</strong>, já com fornecedor, número da nota,
            data, valor total e os itens nos detalhes. O arquivo fica anexado à solicitação.
          </p>
          <p>
            <strong>Tendo o XML, use o XML.</strong> Ele é a nota em si: os valores são lidos do
            próprio arquivo, sem chance de erro de leitura. O PDF e a foto precisam ser
            interpretados, e aí um dígito pode sair errado — confira os valores nesses casos.
          </p>
          <p>
            A solicitação nasce no <strong>fluxo Veículos, sem a placa</strong>. Você abre, escolhe
            o carro e aprova — e é só na aprovação que o título aparece em{" "}
            <strong>Contas a pagar</strong>. Se a compra não for de um carro, é só trocar o fluxo
            para Administrativo ou Capital na hora de editar.
          </p>
          <p className="text-slate-500">
            Nada é pago aqui. Se a nota disser que já foi paga (cartão, dinheiro), isso fica
            anotado nos detalhes — a baixa continua sendo feita em Contas a pagar. Importar a mesma
            nota duas vezes não duplica: o sistema avisa que ela já entrou. E se a nota tiver sido
            emitida para outro CNPJ, ela é importada com um aviso, para você conferir antes de
            aprovar.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Notas para importar"
          description="Confira o resultado depois de importar — nada é aprovado sem você."
        />
        <ImportNfForm />
      </Card>
    </div>
  );
}
