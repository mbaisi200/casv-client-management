export interface HistoricoEntry {
  acao: string;
  data: string;
  detalhes?: string;
  campo?: string;
  valorAnterior?: string;
  valorNovo?: string;
  usuario: string;
  usuarioId?: string;
}

export interface Cliente {
  id: string;
  nome: string;
  agencia: string;
  tipo: 'Visto' | 'Passaporte';
  cidade: string;
  dataInclusao: string;
  casv: string;
  consulado: string;
  situacao: string;
  historico: HistoricoEntry[];
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  deleted: boolean;
}

export interface User {
  email: string;
  uid: string;
}

export interface FilterState {
  search: string;
  agencia: string;
  cidade: string;
  tipo: string;
  situacao: string;
  dateStart: string;
  dateEnd: string;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}
