import { type Dispatch, type SetStateAction } from "react";
import { Trophy } from "lucide-react";
import { PageSectionCard } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TieBreakerCriterion, TournamentType } from "@/modules/tournaments";

export interface TournamentCreateFormValues {
  nome: string;
  descricao: string;
  tipoTorneio: TournamentType;
  quantidadeGrupos: string;
  limiteDeTimes: boolean;
  quantidadeMaximaDeTimes: string;
  torneioOficial: boolean;
  idaEVolta: boolean;
  acumulacaoCartoes: boolean;
  criteriosDesempate: TieBreakerCriterion[];
  minimoJogadores: string;
}

const tieBreakerOptions: Array<{ value: TieBreakerCriterion; label: string }> = [
  { value: "PONTOS", label: "Pontos" },
  { value: "SALDO_GOLS", label: "Saldo de gols" },
  { value: "GOLS_PRO", label: "Gols pró" },
  { value: "CONFRONTO_DIRETO", label: "Confronto direto" },
  { value: "CARTOES", label: "Disciplina (cartões)" },
  { value: "SORTEIO", label: "Sorteio" },
];

interface TournamentCreateFormCardProps {
  form: TournamentCreateFormValues;
  creating: boolean;
  setForm: Dispatch<SetStateAction<TournamentCreateFormValues>>;
  onCreate: () => void;
}

export function TournamentCreateFormCard({ form, creating, setForm, onCreate }: TournamentCreateFormCardProps) {
  return (
    <PageSectionCard
      title="CRIAR TORNEIO"
      description="Somente admins podem alterar regras, estados, sorteio/tabela e resultados"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Nome</Label>
          <Input value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Descrição</Label>
          <Textarea value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Tipo de torneio</Label>
          <Select
            value={form.tipoTorneio}
            onValueChange={(value) => setForm((prev) => ({ ...prev, tipoTorneio: value as TournamentType }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LIGA">Liga</SelectItem>
              <SelectItem value="MATA_MATA">Mata-mata</SelectItem>
              <SelectItem value="GRUPOS_COM_MATA_MATA">Grupos + mata-mata</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Mínimo de jogadores por time</Label>
          <Input
            type="number"
            min={1}
            value={form.minimoJogadores}
            onChange={(e) => setForm((prev) => ({ ...prev, minimoJogadores: e.target.value }))}
          />
        </div>

        {form.tipoTorneio === "GRUPOS_COM_MATA_MATA" && (
          <div className="space-y-2">
            <Label>Quantidade de grupos</Label>
            <Input
              type="number"
              min={2}
              value={form.quantidadeGrupos}
              onChange={(e) => setForm((prev) => ({ ...prev, quantidadeGrupos: e.target.value }))}
            />
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <Label>Critérios de desempate (seleção controlada)</Label>
          <div className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
            {tieBreakerOptions.map((option) => {
              const checked = form.criteriosDesempate.includes(option.value);
              return (
                <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(isChecked) => {
                      setForm((prev) => {
                        if (isChecked) {
                          if (prev.criteriosDesempate.includes(option.value)) return prev;
                          return {
                            ...prev,
                            criteriosDesempate: [...prev.criteriosDesempate, option.value],
                          };
                        }

                        return {
                          ...prev,
                          criteriosDesempate: prev.criteriosDesempate.filter((item) => item !== option.value),
                        };
                      });
                    }}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">A ordem dos critérios selecionados é a ordem de aplicação no desempate.</p>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            id="limite-times"
            checked={form.limiteDeTimes}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, limiteDeTimes: !!checked }))}
          />
          <Label htmlFor="limite-times">Limite de times</Label>
        </div>

        <div className="space-y-2">
          <Label>Qtd máxima de times</Label>
          <Input
            type="number"
            min={2}
            disabled={!form.limiteDeTimes}
            value={form.quantidadeMaximaDeTimes}
            onChange={(e) => setForm((prev) => ({ ...prev, quantidadeMaximaDeTimes: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            id="torneio-oficial"
            checked={form.torneioOficial}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, torneioOficial: !!checked }))}
          />
          <Label htmlFor="torneio-oficial">Torneio oficial</Label>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            id="ida-volta"
            checked={form.idaEVolta}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, idaEVolta: !!checked }))}
          />
          <Label htmlFor="ida-volta">Ida e volta</Label>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            id="cartoes"
            checked={form.acumulacaoCartoes}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, acumulacaoCartoes: !!checked }))}
          />
          <Label htmlFor="cartoes">Acumulação de cartões</Label>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onCreate} disabled={creating} className="gap-2">
          <Trophy className="h-4 w-4" />
          {creating ? "Criando..." : "Criar torneio"}
        </Button>
      </div>
    </PageSectionCard>
  );
}
