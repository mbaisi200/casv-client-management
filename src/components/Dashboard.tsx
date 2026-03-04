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
  RefreshCw
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

    return clientes.filter(c => {
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
  };

  const filteredClientes = getFilteredClients();
  const agencias = [...new Set(clientes.filter(c => !c.deleted).map(c => c.agencia))].sort();

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

    // Handle special values
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

  // Stats for reports
  const getStats = () => {
    const stats: Record<string, number> = {
      'Aguardando': 0,
      'Aprovado': 0,
      'Reprovado': 0,
      'CASV': 0,
      'Aprovado só CASV': 0,
      'Consulado': 0,
      'Não definido': 0
    };

    clientes.filter(c => !c.deleted && c.tipo === 'Visto').forEach(c => {
      const s = c.situacao || 'Não definido';
      if (stats[s] !== undefined) stats[s]++;
      else stats['Não definido']++;
    });

    return stats;
  };

  const stats = getStats();
  const hiddenCount = clientes.filter(c => c.deleted).length;

  // Helper for filter selects
  const handleFilterChange = (field: keyof FilterState, value: string) => {
    if (value === ALL_VALUE) {
      setFilters(prev => ({ ...prev, [field]: '' }));
    } else {
      setFilters(prev => ({ ...prev, [field]: value }));
    }
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
            <TabsTrigger value="reports">📊 Relatórios</TabsTrigger>
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
                        <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('nome')}>
                          Nome {sort.field === 'nome' && (sort.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('agencia')}>
                          Agência {sort.field === 'agencia' && (sort.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-slate-100" onClick={() => handleSort('tipo')}>
                          Tipo {sort.field === 'tipo' && (sort.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Data Inclusão</TableHead>
                        <TableHead>Data CASV</TableHead>
                        <TableHead>Data Consulado</TableHead>
                        <TableHead>Situação</TableHead>
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
              <Button variant="outline" onClick={() => exportCSV(filteredClientes, 'lista_clientes.csv')}>
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => setPdfDialog(true)}>
                <FileText className="w-4 h-4 mr-1" /> Relatório PDF
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>📈 Estatísticas Gerais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-6">
                  {Object.entries(stats).map(([key, value]) => {
                    const colors: Record<string, string> = {
                      'Aguardando': 'bg-purple-100 text-purple-800 border-purple-300',
                      'Aprovado': 'bg-green-100 text-green-800 border-green-300',
                      'Reprovado': 'bg-red-100 text-red-800 border-red-300',
                      'CASV': 'bg-blue-100 text-blue-800 border-blue-300',
                      'Aprovado só CASV': 'bg-emerald-100 text-emerald-800 border-emerald-300',
                      'Consulado': 'bg-violet-100 text-violet-800 border-violet-300',
                      'Não definido': 'bg-gray-100 text-gray-800 border-gray-300'
                    };
                    return (
                      <Badge key={key} variant="outline" className={colors[key]}>
                        {key}: {value}
                      </Badge>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(stats).filter(([_, v]) => v > 0).map(([key, value]) => {
                    const total = Object.values(stats).reduce((a, b) => a + b, 0);
                    const pct = total ? ((value / total) * 100).toFixed(1) : '0';
                    const bgColors: Record<string, string> = {
                      'Aguardando': 'bg-purple-500',
                      'Aprovado': 'bg-green-500',
                      'Reprovado': 'bg-red-500',
                      'CASV': 'bg-blue-500',
                      'Aprovado só CASV': 'bg-emerald-500',
                      'Consulado': 'bg-violet-500',
                      'Não definido': 'bg-gray-400'
                    };
                    return (
                      <Card key={key} className="p-4">
                        <div className="text-sm text-slate-600">{key}</div>
                        <div className="text-2xl font-bold">{value}</div>
                        <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                          <div className={`h-2 rounded-full ${bgColors[key]}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{pct}%</div>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>🏢 Por Agência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(new Set(clientes.filter(c => !c.deleted).map(c => c.agencia))).sort().map(agencia => {
                    const agencyClients = clientes.filter(c => !c.deleted && c.agencia === agencia);
                    const vistos = agencyClients.filter(c => c.tipo === 'Visto');
                    const passaportes = agencyClients.filter(c => c.tipo === 'Passaporte');
                    
                    return (
                      <div key={agencia} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{agencia}</h4>
                          <Badge>{agencyClients.length} clientes</Badge>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-blue-600">Vistos: {vistos.length}</span>
                          <span className="text-amber-600">Passaportes: {passaportes.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button onClick={() => exportCSV(clientes.filter(c => !c.deleted), 'relatorio_completo.csv')}>
                <Download className="w-4 h-4 mr-1" /> Exportar Relatório Completo (CSV)
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={v => setHistoryDialog(prev => ({ ...prev, open: v }))}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
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
