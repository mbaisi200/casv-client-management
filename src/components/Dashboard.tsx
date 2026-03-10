'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { Cliente, HistoricoEntry, FilterState, SortState } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Home, 
  LogOut, 
  Plus, 
  Save, 
  X, 
  Download, 
  Trash2, 
  Eye, 
  EyeOff,
  Edit,
  History,
  FileText,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Users,
  Calendar,
  Building,
  PieChart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CIDADES = ['São Paulo', 'Rio de Janeiro', 'Brasilia', 'Porto Alegre', 'Recife'];
const SITUACOES = ['Aguardando', 'Aprovado', 'Aprovado só CASV', 'CASV', 'Consulado', 'Reprovado'];
const TIPOS = ['Visto', 'Passaporte'];
const ALL_VALUE = '__ALL__';
const NONE_VALUE = '__NONE__';

export function Dashboard() {
  const { user, dbStatus, logout } = useAuth();
  const { toast } = useToast();
  
  // State
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  
  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    agencia: '',
    tipo: 'Visto' as 'Visto' | 'Passaporte',
    cidade: '',
    dataInclusao: '',
    casv: '',
    consulado: '',
    situacao: ''
  });

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    agencia: '',
    cidade: '',
    tipo: '',
    situacao: '',
    dateStart: '',
    dateEnd: ''
  });

  // BI Filter state
  const [biFilters, setBiFilters] = useState({
    dateStart: '',
    dateEnd: '',
    agencia: '',
    tipo: ''
  });

  // Sort state
  const [sort, setSort] = useState<SortState>({ field: '', direction: 'asc' });

  // Dialogs
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; cliente: Cliente | null }>({ 
    open: false, 
    cliente: null 
  });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; message: string; onConfirm: () => void }>({
    open: false,
    message: '',
    onConfirm: () => {}
  });
  const [pdfDialog, setPdfDialog] = useState(false);
  const [pdfFilters, setPdfFilters] = useState({
    dateStart: '',
    dateEnd: '',
    agencia: '',
    tipo: '',
    cidade: ''
  });
  
  // BI Detail Modal
  const [biDetailModal, setBiDetailModal] = useState<{
    open: boolean;
    title: string;
    clientes: Cliente[];
    filterType: string;
    filterValue: string;
  }>({ open: false, title: '', clientes: [], filterType: '', filterValue: '' });

  // Helper functions
  const getLocalDateString = () => {
    const now = new Date();
    const offset = -3;
    const localTime = new Date(now.getTime() + (offset * 60 * 60 * 1000));
    return localTime.toISOString().split('T')[0];
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  // Load clients
  const loadClientes = useCallback(async () => {
    try {
      const q = query(collection(db, 'clientes'));
      const querySnapshot = await getDocs(q);
      
      const data: Cliente[] = querySnapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          nome: d.nome || '',
          agencia: d.agencia || '',
          tipo: d.tipo || 'Visto',
          cidade: d.cidade || '',
          dataInclusao: d.dataInclusao || '',
          casv: d.casv || '',
          consulado: d.consulado || '',
          situacao: d.situacao || '',
          historico: d.historico || [],
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.(),
          createdBy: d.createdBy,
          updatedBy: d.updatedBy,
          deleted: d.deleted || false
        };
      });

      data.sort((a, b) => {
        if (a.tipo === 'Visto' && b.tipo === 'Passaporte') return -1;
        if (a.tipo === 'Passaporte' && b.tipo === 'Visto') return 1;
        const dateA = a.dataInclusao ? new Date(a.dataInclusao) : new Date(0);
        const dateB = b.dataInclusao ? new Date(b.dataInclusao) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setClientes(data);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar dados do banco.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  // Alert checks
  const checkConsuladoAlerts = () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const cincoDiasFuturo = new Date(hoje);
    cincoDiasFuturo.setDate(hoje.getDate() + 5);
    const situacoesFinais = ['Aprovado', 'Aprovado só CASV', 'Reprovado'];

    return clientes.filter(c => {
      if (c.deleted || c.tipo !== 'Visto') return false;
      if (!c.consulado) return false;
      const dataConsulado = new Date(c.consulado);
      if (isNaN(dataConsulado.getTime())) return false;
      dataConsulado.setHours(0, 0, 0, 0);
      if (dataConsulado > cincoDiasFuturo) return false;
      if (situacoesFinais.includes(c.situacao)) return false;
      return true;
    }).sort((a, b) => new Date(a.consulado).getTime() - new Date(b.consulado).getTime());
  };

  const checkCASVAlerts = () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const cincoDiasFuturo = new Date(hoje);
    cincoDiasFuturo.setDate(hoje.getDate() + 5);
    const situacoesFinais = ['Aprovado', 'Aprovado só CASV', 'Reprovado', 'Consulado'];

    return clientes.filter(c => {
      if (c.deleted || c.tipo !== 'Visto') return false;
      if (!c.casv) return false;
      const dataCASV = new Date(c.casv);
      if (isNaN(dataCASV.getTime())) return false;
      dataCASV.setHours(0, 0, 0, 0);
      if (dataCASV > cincoDiasFuturo) return false;
      if (situacoesFinais.includes(c.situacao)) return false;
      return true;
    }).sort((a, b) => new Date(a.casv).getTime() - new Date(b.casv).getTime());
  };

  const consuladoAlerts = checkConsuladoAlerts();
  const casvAlerts = checkCASVAlerts();

  // Filter clients
  const getFilteredClients = () => {
    const hoje = new Date();
    const currentMonth = hoje.getMonth();
    const currentYear = hoje.getFullYear();
    const hasActiveFilters = Object.values(filters).some(v => v);

    let result = clientes.filter(c => {
      if (c.deleted) return false;

      const situacaoStr = (c.situacao || '').trim();
      const finalized = ['Aprovado', 'Aprovado só CASV', 'Reprovado'].includes(situacaoStr);

      if (showHidden) {
        if (!finalized) return false;
      } else {
        if (finalized && !hasActiveFilters) return false;
      }

      if (!showHidden && !hasActiveFilters && c.tipo === 'Passaporte') {
        if (c.dataInclusao) {
          const incDate = new Date(c.dataInclusao);
          if (incDate.getMonth() !== currentMonth || incDate.getFullYear() !== currentYear) {
            return false;
          }
        }
      }

      if (filters.search) {
        const search = filters.search.toUpperCase();
        if (!c.nome.toUpperCase().includes(search) && !c.agencia.toUpperCase().includes(search)) {
          return false;
        }
      }

      if (filters.agencia && c.agencia !== filters.agencia) return false;
      if (filters.cidade && c.cidade !== filters.cidade) return false;
      if (filters.tipo && c.tipo !== filters.tipo) return false;
      if (filters.situacao) {
        if (filters.situacao === 'Não definido' && situacaoStr !== '') return false;
        else if (filters.situacao !== 'Não definido' && situacaoStr !== filters.situacao) return false;
      }
      if (filters.dateStart && c.casv < filters.dateStart) return false;
      if (filters.dateEnd && c.casv > filters.dateEnd) return false;

      return true;
    });

    // Apply sorting
    if (sort.field) {
      result.sort((a, b) => {
        let aVal: any, bVal: any;
        
        switch (sort.field) {
          case 'nome':
            aVal = a.nome.toLowerCase();
            bVal = b.nome.toLowerCase();
            break;
          case 'agencia':
            aVal = a.agencia.toLowerCase();
            bVal = b.agencia.toLowerCase();
            break;
          case 'tipo':
            aVal = a.tipo;
            bVal = b.tipo;
            break;
          case 'cidade':
            aVal = a.cidade.toLowerCase();
            bVal = b.cidade.toLowerCase();
            break;
          case 'dataInclusao':
            aVal = a.dataInclusao ? new Date(a.dataInclusao).getTime() : 0;
            bVal = b.dataInclusao ? new Date(b.dataInclusao).getTime() : 0;
            break;
          case 'casv':
            aVal = a.casv ? new Date(a.casv).getTime() : 0;
            bVal = b.casv ? new Date(b.casv).getTime() : 0;
            break;
          case 'consulado':
            aVal = a.consulado ? new Date(a.consulado).getTime() : 0;
            bVal = b.consulado ? new Date(b.consulado).getTime() : 0;
            break;
          case 'situacao':
            aVal = a.situacao.toLowerCase();
            bVal = b.situacao.toLowerCase();
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  };

  const filteredClientes = getFilteredClients();
  const agencias = [...new Set(clientes.filter(c => !c.deleted).map(c => c.agencia))].sort();

  // BI Statistics with filters
  const getBIStats = () => {
    const filtered = clientes.filter(c => {
      if (c.deleted) return false;
      if (biFilters.tipo && c.tipo !== biFilters.tipo) return false;
      if (biFilters.agencia && c.agencia !== biFilters.agencia) return false;
      if (biFilters.dateStart && c.dataInclusao && c.dataInclusao < biFilters.dateStart) return false;
      if (biFilters.dateEnd && c.dataInclusao && c.dataInclusao > biFilters.dateEnd) return false;
      return true;
    });

    const stats: Record<string, number> = {
      'Aguardando': 0,
      'Aprovado': 0,
      'Reprovado': 0,
      'CASV': 0,
      'Aprovado só CASV': 0,
      'Consulado': 0,
      'Não definido': 0
    };

    const vistos = filtered.filter(c => c.tipo === 'Visto');
    const passaportes = filtered.filter(c => c.tipo === 'Passaporte');

    vistos.forEach(c => {
      const s = c.situacao || 'Não definido';
      if (stats[s] !== undefined) stats[s]++;
      else stats['Não definido']++;
    });

    // Stats by agency
    const byAgency: Record<string, { vistos: number; passaportes: number; situacoes: Record<string, number> }> = {};
    filtered.forEach(c => {
      const ag = c.agencia || 'NÃO DEFINIDA';
      if (!byAgency[ag]) {
        byAgency[ag] = { vistos: 0, passaportes: 0, situacoes: {} };
      }
      if (c.tipo === 'Visto') {
        byAgency[ag].vistos++;
        const s = c.situacao || 'Não definido';
        byAgency[ag].situacoes[s] = (byAgency[ag].situacoes[s] || 0) + 1;
      } else {
        byAgency[ag].passaportes++;
      }
    });

    // Stats by city
    const byCity: Record<string, { total: number; situacoes: Record<string, number> }> = {};
    filtered.filter(c => c.tipo === 'Visto').forEach(c => {
      const city = c.cidade || 'Não definida';
      if (!byCity[city]) {
        byCity[city] = { total: 0, situacoes: {} };
      }
      byCity[city].total++;
      const s = c.situacao || 'Não definido';
      byCity[city].situacoes[s] = (byCity[city].situacoes[s] || 0) + 1;
    });

    // Stats by month
    const byMonth: Record<string, { total: number; aprovados: number }> = {};
    filtered.forEach(c => {
      if (c.dataInclusao) {
        const month = c.dataInclusao.substring(0, 7); // YYYY-MM
        if (!byMonth[month]) {
          byMonth[month] = { total: 0, aprovados: 0 };
        }
        byMonth[month].total++;
        if (c.situacao === 'Aprovado' || c.situacao === 'Aprovado só CASV') {
          byMonth[month].aprovados++;
        }
      }
    });

    return {
      stats,
      vistos: vistos.length,
      passaportes: passaportes.length,
      total: filtered.length,
      byAgency,
      byCity,
      byMonth
    };
  };

  const biStats = getBIStats();

  // CRUD operations
  const handleAddUpdate = async () => {
    if (!formData.nome.trim() || !formData.agencia.trim()) {
      toast({ title: 'Erro', description: 'Preencha Nome e Agência!', variant: 'destructive' });
      return;
    }

    if (formData.tipo === 'Visto') {
      if (formData.situacao && formData.situacao !== 'Aguardando' && !formData.casv) {
        toast({ title: 'Erro', description: 'Preencha Data CASV!', variant: 'destructive' });
        return;
      }
      if (formData.consulado && formData.casv && formData.consulado < formData.casv) {
        toast({ title: 'Erro', description: 'Data Consulado não pode ser anterior à CASV.', variant: 'destructive' });
        return;
      }
    }

    if (formData.tipo === 'Passaporte' && !formData.dataInclusao) {
      toast({ title: 'Erro', description: 'Preencha Data de Inclusão!', variant: 'destructive' });
      return;
    }

    const currentObj = editingId ? clientes.find(c => c.id === editingId) : null;
    const actionType = editingId ? 'Edição' : 'Criação';
    const timestamp = new Date().toISOString();

    let dataInclusaoVal = formData.dataInclusao;
    if (!editingId && !dataInclusaoVal) {
      dataInclusaoVal = getLocalDateString();
    }

    const historico = currentObj ? [...currentObj.historico] : [];
    historico.push({
      acao: actionType,
      data: timestamp,
      detalhes: `Tipo: ${formData.tipo}, Situação: ${formData.situacao || 'Não definida'}, Cidade: ${formData.cidade || 'Não informada'}`,
      usuario: user?.email || 'Sistema',
      usuarioId: user?.uid
    } as HistoricoEntry);

    const clienteData = {
      nome: formData.nome.toUpperCase(),
      agencia: formData.agencia.toUpperCase(),
      tipo: formData.tipo,
      cidade: formData.cidade,
      dataInclusao: dataInclusaoVal,
      casv: formData.casv,
      consulado: formData.consulado,
      situacao: formData.situacao,
      historico,
      updatedAt: serverTimestamp(),
      updatedBy: user?.email
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'clientes', editingId), clienteData);
        toast({ title: 'Sucesso', description: 'Cliente atualizado!' });
      } else {
        await addDoc(collection(db, 'clientes'), {
          ...clienteData,
          createdAt: serverTimestamp(),
          createdBy: user?.email,
          deleted: false
        });
        toast({ title: 'Sucesso', description: 'Cliente adicionado!' });
      }
      resetForm();
      loadClientes();
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro', description: 'Erro ao salvar no Firebase.', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      agencia: '',
      tipo: 'Visto',
      cidade: '',
      dataInclusao: '',
      casv: '',
      consulado: '',
      situacao: ''
    });
    setEditingId(null);
  };

  const prepareEdit = (cliente: Cliente) => {
    setFormData({
      nome: cliente.nome,
      agencia: cliente.agencia,
      tipo: cliente.tipo,
      cidade: cliente.cidade,
      dataInclusao: cliente.dataInclusao,
      casv: cliente.casv,
      consulado: cliente.consulado,
      situacao: cliente.situacao
    });
    setEditingId(cliente.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteClient = async (cliente: Cliente) => {
    setConfirmDialog({
      open: true,
      message: `Tem certeza que deseja excluir o cliente ${cliente.nome}?`,
      onConfirm: async () => {
        try {
          const historico = [...(cliente.historico || [])];
          historico.push({
            acao: 'Exclusão',
            data: new Date().toISOString(),
            detalhes: 'Cliente removido do sistema',
            usuario: user?.email || 'Sistema',
            usuarioId: user?.uid
          });
          
          await updateDoc(doc(db, 'clientes', cliente.id), {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.email,
            historico
          });
          
          toast({ title: 'Info', description: 'Cliente removido.' });
          loadClientes();
        } catch (error) {
          toast({ title: 'Erro', description: 'Erro ao remover.', variant: 'destructive' });
        }
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    });
  };

  const quickUpdate = async (id: string, field: string, value: string) => {
    const c = clientes.find(x => x.id === id);
    if (!c) return;

    if (value === NONE_VALUE) value = '';
    if (value === ALL_VALUE) return;
    
    if (['nome', 'agencia'].includes(field)) value = value.toUpperCase().trim();

    if (field === 'situacao' && value === 'Aguardando') {
      await updateDoc(doc(db, 'clientes', id), {
        dataInclusao: '',
        casv: '',
        consulado: '',
        situacao: 'Aguardando',
        updatedAt: serverTimestamp(),
        updatedBy: user?.email
      });
      loadClientes();
      return;
    }

    if (field === 'consulado' && c.casv && value < c.casv) {
      toast({ title: 'Erro', description: 'Data Consulado anterior à CASV.', variant: 'destructive' });
      return;
    }

    const newHistorico = [...(c.historico || [])];
    newHistorico.push({
      acao: 'Edição Rápida',
      campo: field,
      valorAnterior: String(c[field as keyof Cliente] || ''),
      valorNovo: value,
      data: new Date().toISOString(),
      usuario: user?.email || 'Sistema',
      usuarioId: user?.uid
    });

    try {
      const updateData: Record<string, any> = {
        historico: newHistorico,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email
      };

      if (field === 'nome') updateData.nome = value;
      if (field === 'agencia') updateData.agencia = value;
      if (field === 'cidade') updateData.cidade = value;
      if (field === 'dataInclusao') updateData.dataInclusao = value;
      if (field === 'casv') updateData.casv = value;
      if (field === 'consulado') updateData.consulado = value;
      if (field === 'situacao') updateData.situacao = value;
      if (field === 'tipo') {
        updateData.tipo = value;
        if (value === 'Passaporte') {
          updateData.casv = '';
          updateData.consulado = '';
          updateData.situacao = '';
        }
      }

      await updateDoc(doc(db, 'clientes', id), updateData);
      loadClientes();
    } catch (error) {
      toast({ title: 'Erro', description: 'Erro ao atualizar.', variant: 'destructive' });
    }
  };

  // Sort function
  const handleSort = (field: string) => {
    if (sort.field === field) {
      setSort({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ field, direction: 'asc' });
    }
  };

  const getSortIndicator = (field: string) => {
    if (sort.field !== field) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  };

  // Export functions
  const exportBackup = () => {
    const dataStr = JSON.stringify(clientes, null, 2);
    const blob = new Blob([dataStr], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup_clientes_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    toast({ title: 'Sucesso', description: 'Backup gerado!' });
  };

  const exportCSV = (data: Cliente[], filename: string) => {
    let csv = '\uFEFFNome,Agencia,Tipo,Cidade,DataInclusao,CASV,Consulado,Situacao\n';
    data.forEach(c => {
      csv += `"${c.nome}","${c.agencia}","${c.tipo}","${c.cidade}","${c.dataInclusao}","${c.casv}","${c.consulado}","${c.situacao}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  // Export BI Detail to PDF
  const exportBIDetailPDF = (data: Cliente[], title: string, filterType: string, filterValue: string) => {
    if (data.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum dado para exportar!' });
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation for more horizontal space
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Title
    doc.setFontSize(18);
    doc.text(title.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    // Subtitle with filter info
    doc.setFontSize(10);
    doc.setTextColor(100);
    const today = new Date().toLocaleDateString('pt-BR');
    doc.text(`Gerado em: ${today} | Filtro: ${filterType} = ${filterValue || 'Todos'} | Total: ${data.length} cliente(s)`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Reset text color
    doc.setTextColor(0);

    // Separate by type
    const vistos = data.filter(c => c.tipo === 'Visto');
    const passaportes = data.filter(c => c.tipo === 'Passaporte');

    if (vistos.length > 0) {
      doc.setFontSize(14);
      doc.text('VISTOS', 15, yPos);
      yPos += 8;

      autoTable(doc, {
        startY: yPos,
        head: [['Nome', 'Agência', 'Cidade', 'Data Inclusão', 'CASV', 'Consulado', 'Situação']],
        body: vistos.map(c => [
          c.nome,
          c.agencia,
          c.cidade || '-',
          formatDate(c.dataInclusao),
          formatDate(c.casv),
          formatDate(c.consulado),
          c.situacao || 'Não definido'
        ]),
        headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 35 }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    if (passaportes.length > 0) {
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text('PASSAPORTES', 15, yPos);
      yPos += 8;

      autoTable(doc, {
        startY: yPos,
        head: [['Nome', 'Agência', 'Cidade', 'Data Inclusão', 'Status']],
        body: passaportes.map(c => [
          c.nome,
          c.agencia,
          c.cidade || '-',
          formatDate(c.dataInclusao),
          'EM ANDAMENTO'
        ]),
        headStyles: { fillColor: [245, 158, 11], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 40 },
          2: { cellWidth: 40 },
          3: { cellWidth: 40 },
          4: { cellWidth: 40 }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Summary
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.text('RESUMO', 15, yPos);
    yPos += 8;

    const total = data.length;
    autoTable(doc, {
      startY: yPos,
      body: [
        ['Tipo', 'Quantidade', 'Percentual'],
        ['Vistos', String(vistos.length), total ? ((vistos.length / total) * 100).toFixed(1) + '%' : '0%'],
        ['Passaportes', String(passaportes.length), total ? ((passaportes.length / total) * 100).toFixed(1) + '%' : '0%'],
        ['TOTAL', String(total), '100%']
      ],
      styles: { fontSize: 10, halign: 'center' },
      headStyles: { fillColor: [100, 100, 100] }
    });

    // Save
    const filename = `relatorio_${filterType}_${filterValue || 'todos'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    toast({ title: 'Sucesso', description: `PDF gerado com ${total} registros!` });
  };

  // Export List to PDF
  const exportListPDF = (data: Cliente[], filename: string) => {
    if (data.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum dado para exportar!' });
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    doc.setFontSize(18);
    doc.text('LISTA DE CLIENTES CASV', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(100);
    const today = new Date().toLocaleDateString('pt-BR');
    doc.text(`Gerado em: ${today} | Total: ${data.length} cliente(s)`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;
    doc.setTextColor(0);

    const vistos = data.filter(c => c.tipo === 'Visto');
    const passaportes = data.filter(c => c.tipo === 'Passaporte');

    if (vistos.length > 0) {
      doc.setFontSize(14);
      doc.text('VISTOS', 15, yPos);
      yPos += 8;

      autoTable(doc, {
        startY: yPos,
        head: [['Nome', 'Agência', 'Cidade', 'Data Inclusão', 'CASV', 'Consulado', 'Situação']],
        body: vistos.map(c => [
          c.nome,
          c.agencia,
          c.cidade || '-',
          formatDate(c.dataInclusao),
          formatDate(c.casv),
          formatDate(c.consulado),
          c.situacao || 'Não definido'
        ]),
        headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 35 }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    if (passaportes.length > 0) {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text('PASSAPORTES', 15, yPos);
      yPos += 8;

      autoTable(doc, {
        startY: yPos,
        head: [['Nome', 'Agência', 'Cidade', 'Data Inclusão', 'Status']],
        body: passaportes.map(c => [
          c.nome,
          c.agencia,
          c.cidade || '-',
          formatDate(c.dataInclusao),
          'EM ANDAMENTO'
        ]),
        headStyles: { fillColor: [245, 158, 11], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 40 },
          2: { cellWidth: 40 },
          3: { cellWidth: 40 },
          4: { cellWidth: 40 }
        }
      });
    }

    doc.save(filename);
    toast({ title: 'Sucesso', description: `PDF gerado com ${data.length} registros!` });
  };

  const generatePDFReport = async () => {
    if (!pdfFilters.dateStart || !pdfFilters.dateEnd) {
      toast({ title: 'Erro', description: 'Preencha as datas!', variant: 'destructive' });
      return;
    }

    const filtered = clientes.filter(c => {
      if (c.deleted) return false;
      if (pdfFilters.tipo && c.tipo !== pdfFilters.tipo) return false;
      if (pdfFilters.agencia && c.agencia !== pdfFilters.agencia) return false;
      if (pdfFilters.cidade && c.cidade !== pdfFilters.cidade) return false;
      if (!c.dataInclusao) return false;
      return c.dataInclusao >= pdfFilters.dateStart && c.dataInclusao <= pdfFilters.dateEnd;
    });

    const vistos = filtered.filter(c => c.tipo === 'Visto').sort((a, b) => a.dataInclusao.localeCompare(b.dataInclusao));
    const passaportes = filtered.filter(c => c.tipo === 'Passaporte').sort((a, b) => a.dataInclusao.localeCompare(b.dataInclusao));

    if (vistos.length === 0 && passaportes.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum dado encontrado!' });
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    doc.setFontSize(20);
    doc.text('RELATÓRIO DE CLIENTES CASV', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    doc.setFontSize(11);
    doc.text(`Período: ${formatDate(pdfFilters.dateStart)} à ${formatDate(pdfFilters.dateEnd)}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    if (vistos.length > 0) {
      doc.setFontSize(14);
      doc.text('VISTOS', 15, yPos);
      yPos += 10;

      autoTable(doc, {
        startY: yPos,
        head: [['Nome', 'Agência', 'Cidade', 'Data Emissão', 'Situação']],
        body: vistos.map(c => [c.nome, c.agencia, c.cidade || '-', formatDate(c.dataInclusao), c.situacao || '-']),
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    if (passaportes.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text('PASSAPORTES', 15, yPos);
      yPos += 10;

      autoTable(doc, {
        startY: yPos,
        head: [['Nome', 'Agência', 'Cidade', 'Data Emissão', 'Status']],
        body: passaportes.map(c => [c.nome, c.agencia, c.cidade || '-', formatDate(c.dataInclusao), 'EM ANDAMENTO']),
        headStyles: { fillColor: [245, 158, 11] },
        styles: { fontSize: 9 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.text('RESUMO', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    const total = vistos.length + passaportes.length;
    autoTable(doc, {
      startY: yPos,
      body: [
        ['Tipo', 'Quantidade', 'Percentual'],
        ['Vistos', String(vistos.length), total ? ((vistos.length / total) * 100).toFixed(1) + '%' : '0%'],
        ['Passaportes', String(passaportes.length), total ? ((passaportes.length / total) * 100).toFixed(1) + '%' : '0%'],
        ['TOTAL', String(total), '100%']
      ],
      styles: { fontSize: 10, halign: 'center' }
    });

    doc.save(`relatorio_casv_${pdfFilters.dateStart}_a_${pdfFilters.dateEnd}.pdf`);
    setPdfDialog(false);
    toast({ title: 'Sucesso', description: `PDF gerado com ${total} registros!` });
  };

  const stats = biStats.stats;
  const hiddenCount = clientes.filter(c => c.deleted).length;

  // Helper for filter selects
  const handleFilterChange = (field: keyof FilterState, value: string) => {
    if (value === ALL_VALUE) {
      setFilters(prev => ({ ...prev, [field]: '' }));
    } else {
      setFilters(prev => ({ ...prev, [field]: value }));
    }
  };

  // Helper for BI detail modal
  const openBIDetail = (filterType: string, filterValue: string, title: string) => {
    const filtered = clientes.filter(c => {
      if (c.deleted) return false;
      if (biFilters.tipo && c.tipo !== biFilters.tipo) return false;
      if (biFilters.agencia && c.agencia !== biFilters.agencia) return false;
      if (biFilters.dateStart && c.dataInclusao && c.dataInclusao < biFilters.dateStart) return false;
      if (biFilters.dateEnd && c.dataInclusao && c.dataInclusao > biFilters.dateEnd) return false;
      
      switch (filterType) {
        case 'situacao':
          return c.tipo === 'Visto' && (c.situacao || 'Não definido') === filterValue;
        case 'tipo':
          return c.tipo === filterValue;
        case 'agencia':
          return c.agencia === filterValue;
        case 'cidade':
          return c.cidade === filterValue;
        case 'total':
          return true;
        case 'aprovados':
          return c.situacao === 'Aprovado' || c.situacao === 'Aprovado só CASV';
        default:
          return true;
      }
    });
    
    setBiDetailModal({
      open: true,
      title,
      clientes: filtered,
      filterType,
      filterValue
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-lg shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">📋 Gerenciamento de Clientes CASV</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${dbStatus === 'online' ? 'bg-green-500' : dbStatus === 'offline' ? 'bg-red-500' : 'bg-gray-400'}`} />
              <span className={`text-sm ${dbStatus === 'online' ? 'text-green-600' : dbStatus === 'offline' ? 'text-red-600' : 'text-gray-500'}`}>
                Banco: {dbStatus === 'online' ? 'Online' : dbStatus === 'offline' ? 'Offline' : 'Verificando...'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-700">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => { resetForm(); loadClientes(); }}>
              <Home className="w-4 h-4 mr-1" /> Início
            </Button>
            <Button variant="destructive" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {consuladoAlerts.length > 0 && (
          <Card className="border-red-300 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-red-800 flex items-center gap-2 text-base">
                <AlertTriangle className="w-5 h-5" />
                CLIENTES COM DATA CONSULADO EM 5 DIAS
                <Badge className="bg-red-600">{consuladoAlerts.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {consuladoAlerts.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-white p-2 rounded border border-red-200">
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-sm text-slate-600">{c.agencia} • Consulado: {formatDate(c.consulado)}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => prepareEdit(c)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {casvAlerts.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-800 flex items-center gap-2 text-base">
                <AlertTriangle className="w-5 h-5" />
                CLIENTES COM DATA CASV EM 5 DIAS
                <Badge className="bg-amber-600">{casvAlerts.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {casvAlerts.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-white p-2 rounded border border-amber-200">
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-sm text-slate-600">{c.agencia} • CASV: {formatDate(c.casv)}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => prepareEdit(c)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">📋 Lista de Clientes</TabsTrigger>
            <TabsTrigger value="bi">📊 BI / Dashboard</TabsTrigger>
            <TabsTrigger value="reports">📄 Relatórios</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-6">
            {/* Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {editingId ? '✏️ Editar Cliente' : '➕ Cadastrar Cliente'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>Nome Completo *</Label>
                    <Input 
                      value={formData.nome}
                      onChange={e => setFormData(prev => ({ ...prev, nome: e.target.value.toUpperCase() }))}
                      placeholder="Ex: ANITA SILVA"
                    />
                  </div>
                  <div>
                    <Label>Agência *</Label>
                    <Input 
                      value={formData.agencia}
                      onChange={e => setFormData(prev => ({ ...prev, agencia: e.target.value.toUpperCase() }))}
                      placeholder="Ex: AGENCIA X"
                    />
                  </div>
                  <div>
                    <Label>Tipo *</Label>
                    <Select value={formData.tipo || 'Visto'} onValueChange={(v: 'Visto' | 'Passaporte') => setFormData(prev => ({ ...prev, tipo: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Select value={formData.cidade || NONE_VALUE} onValueChange={v => setFormData(prev => ({ ...prev, cidade: v === NONE_VALUE ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Selecione...</SelectItem>
                        {CIDADES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data de Inclusão</Label>
                    <Input 
                      type="date"
                      value={formData.dataInclusao}
                      onChange={e => setFormData(prev => ({ ...prev, dataInclusao: e.target.value }))}
                    />
                  </div>
                  {formData.tipo === 'Visto' && (
                    <>
                      <div>
                        <Label>Data CASV *</Label>
                        <Input 
                          type="date"
                          value={formData.casv}
                          onChange={e => setFormData(prev => ({ ...prev, casv: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Data Consulado</Label>
                        <Input 
                          type="date"
                          value={formData.consulado}
                          onChange={e => setFormData(prev => ({ ...prev, consulado: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Situação</Label>
                        <Select value={formData.situacao || NONE_VALUE} onValueChange={v => setFormData(prev => ({ ...prev, situacao: v === NONE_VALUE ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="-- Selecione --" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>-- Selecione --</SelectItem>
                            {SITUACOES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <Button onClick={handleAddUpdate} className={editingId ? 'bg-amber-500 hover:bg-amber-600' : ''}>
                    {editingId ? <><Save className="w-4 h-4 mr-1" /> Salvar Alterações</> : <><Plus className="w-4 h-4 mr-1" /> Adicionar Cliente</>}
                  </Button>
                  {editingId && (
                    <Button variant="secondary" onClick={resetForm}>
                      <X className="w-4 h-4 mr-1" /> Cancelar
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button variant="outline" onClick={exportBackup}>
                    <Download className="w-4 h-4 mr-1" /> Backup
                  </Button>
                  <Button variant="destructive" onClick={() => setConfirmDialog({
                    open: true,
                    message: 'Isso apagará TODOS os registros. Continuar?',
                    onConfirm: async () => {
                      for (const c of clientes) {
                        await deleteDoc(doc(db, 'clientes', c.id));
                      }
                      toast({ title: 'Info', description: 'Base limpa.' });
                      loadClientes();
                      setConfirmDialog(prev => ({ ...prev, open: false }));
                    }
                  })}>
                    <Trash2 className="w-4 h-4 mr-1" /> Limpar Tudo
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <Label>🔍 Busca (Nome, Agência)</Label>
                    <Input 
                      value={filters.search}
                      onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      placeholder="Digite para buscar..."
                    />
                  </div>
                  <div>
                    <Label>Agência</Label>
                    <Select value={filters.agencia || ALL_VALUE} onValueChange={v => handleFilterChange('agencia', v)}>
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                        {agencias.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Select value={filters.cidade || ALL_VALUE} onValueChange={v => handleFilterChange('cidade', v)}>
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                        {CIDADES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={filters.tipo || ALL_VALUE} onValueChange={v => handleFilterChange('tipo', v)}>
                      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                        {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Situação</Label>
                    <Select value={filters.situacao || ALL_VALUE} onValueChange={v => handleFilterChange('situacao', v)}>
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                        <SelectItem value="Não definido">Não definido</SelectItem>
                        {SITUACOES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data CASV (Início)</Label>
                    <Input type="date" value={filters.dateStart} onChange={e => setFilters(prev => ({ ...prev, dateStart: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Data CASV (Fim)</Label>
                    <Input type="date" value={filters.dateEnd} onChange={e => setFilters(prev => ({ ...prev, dateEnd: e.target.value }))} />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <Button 
                    variant={showHidden ? 'default' : 'outline'}
                    onClick={() => setShowHidden(!showHidden)}
                    className={showHidden ? 'bg-violet-600 hover:bg-violet-700' : ''}
                  >
                    {showHidden ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                    {showHidden ? `Mostrando ${filteredClientes.length} Ocultos` : `Mostrar Ocultos (${hiddenCount})`}
                  </Button>
                  <div className="text-sm text-slate-600">
                    Mostrando <strong>{filteredClientes.length}</strong> registros
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('nome')}>
                          Nome {getSortIndicator('nome')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('agencia')}>
                          Agência {getSortIndicator('agencia')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('tipo')}>
                          Tipo {getSortIndicator('tipo')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('cidade')}>
                          Cidade {getSortIndicator('cidade')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('dataInclusao')}>
                          Data Inclusão {getSortIndicator('dataInclusao')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('casv')}>
                          Data CASV {getSortIndicator('casv')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('consulado')}>
                          Data Consulado {getSortIndicator('consulado')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100 select-none" onClick={() => handleSort('situacao')}>
                          Situação {getSortIndicator('situacao')}
                        </TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClientes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                            Nenhum cliente encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredClientes.map(c => {
                          const isConsuladoAlert = consuladoAlerts.some(a => a.id === c.id);
                          const isCASVAlert = casvAlerts.some(a => a.id === c.id);
                          const rowClass = isConsuladoAlert ? 'bg-red-50 border-l-4 border-red-400' : 
                                          isCASVAlert ? 'bg-amber-50 border-l-4 border-amber-400' : '';

                          return (
                            <TableRow key={c.id} className={rowClass}>
                              <TableCell 
                                contentEditable 
                                suppressContentEditableWarning
                                onBlur={e => quickUpdate(c.id, 'nome', e.currentTarget.textContent || '')}
                                className="font-medium"
                              >
                                {c.nome}
                              </TableCell>
                              <TableCell 
                                contentEditable 
                                suppressContentEditableWarning
                                onBlur={e => quickUpdate(c.id, 'agencia', e.currentTarget.textContent || '')}
                              >
                                {c.agencia}
                              </TableCell>
                              <TableCell>
                                <Select value={c.tipo || 'Visto'} onValueChange={v => quickUpdate(c.id, 'tipo', v)}>
                                  <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select value={c.cidade || NONE_VALUE} onValueChange={v => quickUpdate(c.id, 'cidade', v === NONE_VALUE ? '' : v)}>
                                  <SelectTrigger className="h-8 w-28"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE_VALUE}>Selecione</SelectItem>
                                    {CIDADES.map(ci => <SelectItem key={ci} value={ci}>{ci}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input 
                                  type="date" 
                                  value={c.dataInclusao} 
                                  onChange={e => quickUpdate(c.id, 'dataInclusao', e.target.value)}
                                  className="h-8 w-32"
                                />
                              </TableCell>
                              <TableCell>
                                {c.tipo === 'Visto' ? (
                                  <Input 
                                    type="date" 
                                    value={c.casv} 
                                    onChange={e => quickUpdate(c.id, 'casv', e.target.value)}
                                    className="h-8 w-32"
                                  />
                                ) : <span className="text-slate-400">-</span>}
                              </TableCell>
                              <TableCell>
                                {c.tipo === 'Visto' ? (
                                  <Input 
                                    type="date" 
                                    value={c.consulado} 
                                    onChange={e => quickUpdate(c.id, 'consulado', e.target.value)}
                                    className="h-8 w-32"
                                  />
                                ) : <span className="text-slate-400">-</span>}
                              </TableCell>
                              <TableCell>
                                {c.tipo === 'Visto' ? (
                                  <Select value={c.situacao || NONE_VALUE} onValueChange={v => quickUpdate(c.id, 'situacao', v === NONE_VALUE ? '' : v)}>
                                    <SelectTrigger className="h-8 w-28"><SelectValue placeholder="--" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={NONE_VALUE}>--</SelectItem>
                                      {SITUACOES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : <Badge variant="outline" className="bg-amber-100 text-amber-800">PASSAPORTE</Badge>}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => prepareEdit(c)}>
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setHistoryDialog({ open: true, cliente: c })}>
                                    <History className="w-4 h-4" />
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => deleteClient(c)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Export buttons */}
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={() => exportListPDF(filteredClientes, 'lista_clientes.pdf')}>
                <FileText className="w-4 h-4 mr-1" /> Exportar PDF
              </Button>
              <Button variant="outline" onClick={() => setPdfDialog(true)}>
                <FileText className="w-4 h-4 mr-1" /> Relatório PDF Personalizado
              </Button>
            </div>
          </TabsContent>

          {/* BI Tab */}
          <TabsContent value="bi" className="space-y-6">
            {/* BI Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="w-5 h-5" /> Filtros do BI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Data Inclusão (Início)</Label>
                    <Input 
                      type="date" 
                      value={biFilters.dateStart} 
                      onChange={e => setBiFilters(prev => ({ ...prev, dateStart: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <Label>Data Inclusão (Fim)</Label>
                    <Input 
                      type="date" 
                      value={biFilters.dateEnd} 
                      onChange={e => setBiFilters(prev => ({ ...prev, dateEnd: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <Label>Agência</Label>
                    <Select value={biFilters.agencia || ALL_VALUE} onValueChange={v => setBiFilters(prev => ({ ...prev, agencia: v === ALL_VALUE ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                        {agencias.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={biFilters.tipo || ALL_VALUE} onValueChange={v => setBiFilters(prev => ({ ...prev, tipo: v === ALL_VALUE ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                        {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card 
                className="bg-gradient-to-br from-blue-500 to-blue-600 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-lg"
                onClick={() => openBIDetail('total', '', 'Todos os Clientes')}
              >
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-xs">Total de Clientes</p>
                      <p className="text-2xl font-bold">{biStats.total}</p>
                    </div>
                    <Users className="w-8 h-8 text-blue-200" />
                  </div>
                </CardContent>
              </Card>
              <Card 
                className="bg-gradient-to-br from-green-500 to-green-600 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-lg"
                onClick={() => openBIDetail('tipo', 'Visto', 'Clientes Visto')}
              >
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100 text-xs">Vistos</p>
                      <p className="text-2xl font-bold">{biStats.vistos}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>
              <Card 
                className="bg-gradient-to-br from-amber-500 to-amber-600 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-lg"
                onClick={() => openBIDetail('tipo', 'Passaporte', 'Clientes Passaporte')}
              >
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-amber-100 text-xs">Passaportes</p>
                      <p className="text-2xl font-bold">{biStats.passaportes}</p>
                    </div>
                    <Calendar className="w-8 h-8 text-amber-200" />
                  </div>
                </CardContent>
              </Card>
              <Card 
                className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white cursor-pointer hover:scale-[1.02] transition-transform shadow-lg"
                onClick={() => openBIDetail('aprovados', '', 'Clientes Aprovados')}
              >
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-100 text-xs">Aprovados</p>
                      <p className="text-2xl font-bold">{stats['Aprovado'] + stats['Aprovado só CASV']}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-emerald-200" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Status by Situation */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">📊 Distribuição por Situação (Clique para detalhes)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {Object.entries(stats).map(([key, value]) => {
                    const total = biStats.vistos || 1;
                    const pct = ((value / total) * 100).toFixed(0);
                    const bgColors: Record<string, string> = {
                      'Aguardando': 'from-purple-500 to-purple-600',
                      'Aprovado': 'from-green-500 to-green-600',
                      'Reprovado': 'from-red-500 to-red-600',
                      'CASV': 'from-blue-500 to-blue-600',
                      'Aprovado só CASV': 'from-emerald-500 to-emerald-600',
                      'Consulado': 'from-violet-500 to-violet-600',
                      'Não definido': 'from-gray-400 to-gray-500'
                    };
                    return (
                      <Card 
                        key={key} 
                        className={`bg-gradient-to-br ${bgColors[key]} text-white cursor-pointer hover:scale-[1.03] transition-transform shadow-md`}
                        onClick={() => openBIDetail('situacao', key, `Situação: ${key}`)}
                      >
                        <CardContent className="pt-3 pb-3 px-3">
                          <p className="text-[10px] opacity-90 truncate">{key}</p>
                          <div className="flex items-end justify-between mt-1">
                            <p className="text-xl font-bold">{value}</p>
                            <p className="text-xs opacity-80">{pct}%</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* By Agency */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="w-5 h-5" /> Por Agência
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agência</TableHead>
                        <TableHead className="text-center">Vistos</TableHead>
                        <TableHead className="text-center">Passaportes</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Aprovados</TableHead>
                        <TableHead className="text-center">Reprovados</TableHead>
                        <TableHead className="text-center">Pendentes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(biStats.byAgency).sort(([,a], [,b]) => (b.vistos + b.passaportes) - (a.vistos + a.passaportes)).map(([agencia, data]) => (
                        <TableRow key={agencia}>
                          <TableCell className="font-medium">{agencia}</TableCell>
                          <TableCell className="text-center"><Badge className="bg-blue-100 text-blue-800">{data.vistos}</Badge></TableCell>
                          <TableCell className="text-center"><Badge className="bg-amber-100 text-amber-800">{data.passaportes}</Badge></TableCell>
                          <TableCell className="text-center font-bold">{data.vistos + data.passaportes}</TableCell>
                          <TableCell className="text-center"><Badge className="bg-green-100 text-green-800">{(data.situacoes['Aprovado'] || 0) + (data.situacoes['Aprovado só CASV'] || 0)}</Badge></TableCell>
                          <TableCell className="text-center"><Badge className="bg-red-100 text-red-800">{data.situacoes['Reprovado'] || 0}</Badge></TableCell>
                          <TableCell className="text-center"><Badge className="bg-purple-100 text-purple-800">{(data.situacoes['Aguardando'] || 0) + (data.situacoes['CASV'] || 0) + (data.situacoes['Consulado'] || 0)}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* By City */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5" /> Por Cidade (Vistos)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {Object.entries(biStats.byCity).sort(([,a], [,b]) => b.total - a.total).map(([city, data]) => (
                    <Card key={city} className="border">
                      <CardContent className="pt-4">
                        <p className="font-semibold truncate">{city}</p>
                        <p className="text-2xl font-bold text-blue-600">{data.total}</p>
                        <div className="text-xs text-slate-600 mt-2 space-y-1">
                          {Object.entries(data.situacoes).slice(0, 3).map(([s, count]) => (
                            <div key={s} className="flex justify-between">
                              <span>{s}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Timeline by Month */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📈 Evolução Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(biStats.byMonth).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([month, data]) => {
                    const [year, m] = month.split('-');
                    const monthName = new Date(parseInt(year), parseInt(m) - 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    const maxTotal = Math.max(...Object.values(biStats.byMonth).map(d => d.total), 1);
                    const barWidth = (data.total / maxTotal) * 100;
                    const approvalRate = data.total > 0 ? ((data.aprovados / data.total) * 100).toFixed(0) : 0;
                    
                    return (
                      <div key={month} className="flex items-center gap-4">
                        <div className="w-28 text-sm font-medium capitalize">{monthName}</div>
                        <div className="flex-1">
                          <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-end pr-2"
                              style={{ width: `${barWidth}%` }}
                            >
                              <span className="text-xs text-white font-bold">{data.total}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-20 text-sm text-right">
                          <span className="text-green-600 font-medium">{approvalRate}%</span>
                          <span className="text-slate-400 text-xs"> apr.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>📄 Gerar Relatórios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto text-blue-500 mb-4" />
                        <h3 className="font-semibold text-lg">Relatório PDF Personalizado</h3>
                        <p className="text-slate-600 text-sm mt-2">Gere um relatório completo em PDF com filtros por data, agência e tipo.</p>
                        <Button className="mt-4" onClick={() => setPdfDialog(true)}>
                          Gerar PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto text-green-500 mb-4" />
                        <h3 className="font-semibold text-lg">Exportar Completo para PDF</h3>
                        <p className="text-slate-600 text-sm mt-2">Exporte todos os dados para um arquivo PDF em formato paisagem.</p>
                        <Button className="mt-4" variant="outline" onClick={() => exportListPDF(clientes.filter(c => !c.deleted), 'relatorio_completo.pdf')}>
                          Exportar PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={v => setHistoryDialog(prev => ({ ...prev, open: v }))}>
        <DialogContent className="max-w-[85vw] w-[85vw] max-h-[60vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico: {historyDialog.cliente?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {historyDialog.cliente?.historico?.length ? (
              [...historyDialog.cliente.historico].reverse().map((h, i) => (
                <div key={i} className="border-l-4 border-blue-400 pl-3 py-2 bg-slate-50 rounded-r">
                  <div className="font-semibold text-blue-800">{h.acao}</div>
                  <div className="text-sm">{h.detalhes || (h.campo && `Campo: ${h.campo}`)}</div>
                  <div className="text-xs text-slate-500">
                    Por: {h.usuario} • {new Date(h.data).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500">Sem histórico.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* BI Detail Modal */}
      <Dialog open={biDetailModal.open} onOpenChange={v => setBiDetailModal(prev => ({ ...prev, open: v }))}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[75vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <PieChart className="w-6 h-6 text-blue-600" /> {biDetailModal.title}
            </DialogTitle>
            <DialogDescription className="text-base">
              {biDetailModal.clientes.length} cliente(s) encontrado(s)
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto flex-1 px-6 py-4">
            <Table className="w-full table-fixed min-w-[1120px]">
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="w-[250px] font-semibold">Nome</TableHead>
                  <TableHead className="w-[180px] font-semibold">Agência</TableHead>
                  <TableHead className="w-[150px] font-semibold text-center">Cidade</TableHead>
                  <TableHead className="w-[120px] font-semibold text-center">Inclusão</TableHead>
                  <TableHead className="w-[120px] font-semibold text-center">CASV</TableHead>
                  <TableHead className="w-[120px] font-semibold text-center">Consulado</TableHead>
                  <TableHead className="w-[180px] font-semibold text-center">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {biDetailModal.clientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500 text-lg">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  biDetailModal.clientes.map(c => (
                    <TableRow key={c.id} className="hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => {
                      setBiDetailModal(prev => ({ ...prev, open: false }));
                      prepareEdit(c);
                      setActiveTab('list');
                    }}>
                      <TableCell className="font-medium truncate" title={c.nome}>{c.nome}</TableCell>
                      <TableCell className="truncate" title={c.agencia}>{c.agencia}</TableCell>
                      <TableCell className="text-center truncate">{c.cidade || '-'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{formatDate(c.dataInclusao)}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{formatDate(c.casv)}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{formatDate(c.consulado)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={
                          c.situacao === 'Aprovado' ? 'bg-green-100 text-green-800 border-green-300' :
                          c.situacao === 'Reprovado' ? 'bg-red-100 text-red-800 border-red-300' :
                          c.situacao === 'CASV' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                          c.situacao === 'Aprovado só CASV' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                          c.situacao === 'Consulado' ? 'bg-violet-100 text-violet-800 border-violet-300' :
                          'bg-gray-100 text-gray-800 border-gray-300'
                        }>
                          {c.situacao || 'Não definido'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-slate-50 gap-3">
            <Button variant="outline" size="lg" onClick={() => setBiDetailModal(prev => ({ ...prev, open: false }))}>
              Fechar
            </Button>
            <Button size="lg" onClick={() => {
              exportBIDetailPDF(biDetailModal.clientes, biDetailModal.title, biDetailModal.filterType, biDetailModal.filterValue);
            }}>
              <FileText className="w-5 h-5 mr-2" /> Exportar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={v => setConfirmDialog(prev => ({ ...prev, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmação</DialogTitle>
            <DialogDescription>{confirmDialog.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDialog.onConfirm}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Dialog */}
      <Dialog open={pdfDialog} onOpenChange={setPdfDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>📄 Relatório PDF</DialogTitle>
            <DialogDescription>Configure os filtros para o relatório</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Data de Emissão - Início</Label>
              <Input type="date" value={pdfFilters.dateStart} onChange={e => setPdfFilters(prev => ({ ...prev, dateStart: e.target.value }))} />
            </div>
            <div>
              <Label>Data de Emissão - Fim</Label>
              <Input type="date" value={pdfFilters.dateEnd} onChange={e => setPdfFilters(prev => ({ ...prev, dateEnd: e.target.value }))} />
            </div>
            <div>
              <Label>Agência (opcional)</Label>
              <Select value={pdfFilters.agencia || ALL_VALUE} onValueChange={v => setPdfFilters(prev => ({ ...prev, agencia: v === ALL_VALUE ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                  {agencias.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo (opcional)</Label>
              <Select value={pdfFilters.tipo || ALL_VALUE} onValueChange={v => setPdfFilters(prev => ({ ...prev, tipo: v === ALL_VALUE ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                  {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cidade (opcional)</Label>
              <Select value={pdfFilters.cidade || ALL_VALUE} onValueChange={v => setPdfFilters(prev => ({ ...prev, cidade: v === ALL_VALUE ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                  {CIDADES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPdfDialog(false)}>Cancelar</Button>
            <Button onClick={generatePDFReport}>Gerar PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
