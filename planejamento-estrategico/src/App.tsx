import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Carregando } from './components/ui';
import { LoginPage } from './pages/Login';
import { PainelPage } from './pages/Painel';
import { IdentidadePage } from './pages/Identidade';
import { AmbicaoPage } from './pages/Ambicao';
import { IniciativaPage, MapaEstrategicoPage, ObjetivoPage, PilarPage } from './pages/Estrategia';
import { AcaoPage, ExecucaoPage } from './pages/Execucao';
import { IndicadorPage, IndicadoresPage } from './pages/Indicadores';
import { AreaPage, AreasPage, PessoaPage, PessoasPage } from './pages/Organizacao';
import { CargosSalariosPage, CarreiraSocietariaPage } from './pages/Gente';
import { ValuationPage } from './pages/Valuation';
import { ConfiguracoesPage } from './pages/Configuracoes';

/**
 * Mapa de rotas = mapa do drill-down.
 *   /estrategia → /estrategia/pilares/:id → /estrategia/objetivos/:id
 *   → /estrategia/iniciativas/:id → /execucao/:id (ação)
 *   /areas → /areas/:id → /pessoas/:id
 */
export default function App() {
  const { carregando, logado, papel } = useAuth();
  if (carregando) return <Carregando />;
  if (!logado) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (!papel) {
    return <div className="p-10 text-center text-sm text-ink-600">Seu usuário ainda não tem perfil de acesso ao planejamento. Peça à Diretoria para liberar.</div>;
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<PainelPage />} />
        <Route path="/identidade" element={<IdentidadePage />} />
        <Route path="/ambicao" element={<AmbicaoPage />} />
        <Route path="/estrategia" element={<MapaEstrategicoPage />} />
        <Route path="/estrategia/pilares/:id" element={<PilarPage />} />
        <Route path="/estrategia/objetivos/:id" element={<ObjetivoPage />} />
        <Route path="/estrategia/iniciativas/:id" element={<IniciativaPage />} />
        <Route path="/execucao" element={<ExecucaoPage />} />
        <Route path="/execucao/:id" element={<AcaoPage />} />
        <Route path="/indicadores" element={<IndicadoresPage />} />
        <Route path="/indicadores/:id" element={<IndicadorPage />} />
        <Route path="/areas" element={<AreasPage />} />
        <Route path="/areas/:id" element={<AreaPage />} />
        <Route path="/pessoas" element={<PessoasPage />} />
        <Route path="/pessoas/:id" element={<PessoaPage />} />
        <Route path="/cargos-salarios" element={<CargosSalariosPage />} />
        <Route path="/carreira-societaria" element={<CarreiraSocietariaPage />} />
        <Route path="/valuation" element={<ValuationPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="*" element={<p className="py-20 text-center text-ink-500">Página não encontrada.</p>} />
      </Route>
    </Routes>
  );
}
