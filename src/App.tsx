import { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, Medal, Search, RefreshCw, Download, 
  Key, LogOut, Users, Award, Filter, TrendingUp
} from 'lucide-react';
import Logo from './assets/logo.png';

interface ConsumerScore {
  saldo: number;
  loja: string;
  cashback: number;
}

interface Consumer {
  nome: string;
  sexo: string;
  data_nascimento: string;
  email: string;
  telefone: string;
  pontuacoes: ConsumerScore[];
}

export default function App() {
  const [token, setToken] = useState<string>('');
  const [inputToken, setInputToken] = useState<string>('');
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [error, setError] = useState<string>('');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLoja, setSelectedLoja] = useState<string>('all');
  
  // Sort
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Hub Integration
  const hubUserName = window.OwnHub?.getUserName() || 'Administrador';
  const hubUserInitials = useMemo(() => {
    return hubUserName
      .split(' ')
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'AD';
  }, [hubUserName]);

  // Load token from localStorage
  useEffect(() => {
    const defaultToken = 'a1cdae78-2385-4b31-b5ae-fb38153d4976-1403';
    const savedToken = localStorage.getItem('fidelimax_token') || defaultToken;
    if (savedToken) {
      setToken(savedToken);
      setInputToken(savedToken);
      fetchAllConsumers(savedToken);
    }
  }, []);

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;
    localStorage.setItem('fidelimax_token', inputToken.trim());
    setToken(inputToken.trim());
    fetchAllConsumers(inputToken.trim());
  };

  const handleLogout = () => {
    // Clear Hub session and redirect to Hub portal
    localStorage.removeItem('@own-hub:session');
    window.location.href = 'https://ownpainel.vercel.app';
  };

  const fetchAllConsumers = async (authToken: string) => {
    setLoading(true);
    setError('');
    setProgress({ current: 0, total: 0 });
    let allConsumers: Consumer[] = [];
    let skip = 0;
    const take = 50;

    try {
      while (true) {
        const response = await fetch('/fidelimax-api/api/Integracao/ListarConsumidores', {
          method: 'POST',
          headers: {
            'AuthToken': authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            novos: false,
            skip: skip,
            take: take
          })
        });

        if (!response.ok) {
          throw new Error(`Erro na API (${response.status}). Verifique a chave de acesso.`);
        }

        const data = await response.json();
        
        if (data.CodigoResposta !== 100) {
          throw new Error(data.MensagemErro || 'Erro desconhecido retornado pela API.');
        }

        const list = data.Consumidores || data.consumidores || [];
        allConsumers = [...allConsumers, ...list];
        
        const total = data.total || 0;
        setProgress({ current: allConsumers.length, total: total });

        if (list.length < take || allConsumers.length >= total) {
          break;
        }

        skip += take;
      }

      setConsumers(allConsumers);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro de conexão ao carregar os clientes.');
    } finally {
      setLoading(false);
    }
  };

  // Get list of unique store names
  const lojasList = useMemo(() => {
    const stores = new Set<string>();
    consumers.forEach(c => {
      if (Array.isArray(c.pontuacoes)) {
        c.pontuacoes.forEach(p => {
          if (p.loja) stores.add(p.loja);
        });
      }
    });
    return Array.from(stores).sort();
  }, [consumers]);

  // Compute scores for active filter
  const processedConsumers = useMemo(() => {
    return consumers.map(c => {
      let points = 0;
      const storesWithScore: string[] = [];

      if (Array.isArray(c.pontuacoes)) {
        c.pontuacoes.forEach(p => {
          if (p.loja) storesWithScore.push(`${p.loja} (${p.saldo} pts)`);
          
          if (selectedLoja === 'all') {
            points += p.saldo || 0;
          } else if (p.loja === selectedLoja) {
            points = p.saldo || 0;
          }
        });
      }

      return {
        ...c,
        displayPoints: points,
        lojasList: storesWithScore.join(', ') || 'Nenhuma'
      };
    });
  }, [consumers, selectedLoja]);

  // Filter and Sort
  const filteredAndRankedConsumers = useMemo(() => {
    let result = processedConsumers.filter(c => {
      const nameMatch = c.nome?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // If we filtered by store, only keep customers who actually have points in that store
      if (selectedLoja !== 'all') {
        const hasPointsInStore = c.pontuacoes?.some(p => p.loja === selectedLoja && p.saldo > 0);
        return nameMatch && hasPointsInStore;
      }
      
      return nameMatch;
    });

    // Sort by points
    result.sort((a, b) => {
      let valA = a.displayPoints;
      let valB = b.displayPoints;
      
      if (valA === valB) {
        // Tie breaker by name
        return (a.nome || '').localeCompare(b.nome || '');
      }

      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    return result;
  }, [processedConsumers, searchQuery, sortOrder, selectedLoja]);

  // Total stats
  const totalStats = useMemo(() => {
    let pts = 0;
    
    processedConsumers.forEach(c => {
      pts += c.displayPoints;
    });

    return { points: pts };
  }, [processedConsumers]);

  // Top 3 Medalists
  const topThree = useMemo(() => {
    // Only take top 3 from descending sort
    const descSorted = [...processedConsumers].sort((a, b) => b.displayPoints - a.displayPoints);
    return descSorted.slice(0, 3);
  }, [processedConsumers]);

  const handleSort = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const exportToCSV = () => {
    if (filteredAndRankedConsumers.length === 0) return;
    
    const headers = ['Posicao', 'Nome', 'Email', 'Telefone', 'Pontos', 'Pontuacoes por Loja'];
    const rows = filteredAndRankedConsumers.map((c, index) => [
      index + 1,
      c.nome || 'Sem Nome',
      c.email || 'N/A',
      c.telefone || 'N/A',
      c.displayPoints,
      c.lojasList
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ranking_fidelimax_${selectedLoja === 'all' ? 'geral' : selectedLoja.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If token is missing, show setup screen
  if (!token) {
    return (
      <div className="setup-wrapper card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(225, 6, 0, 0.1)', border: '1px solid rgba(225, 6, 0, 0.2)',
            color: '#e10600', marginBottom: 16
          }}>
            <Trophy size={36} />
          </div>
          <h1>OWN Ranking</h1>
          <p style={{ fontSize: '0.9rem', marginTop: 8 }}>Digite o Token da Fidelimax para gerar o ranking de fidelidade.</p>
        </div>

        <form onSubmit={handleSaveToken}>
          <div className="input-group">
            <label className="input-label" htmlFor="token-input">Token de Integração</label>
            <input 
              id="token-input"
              type="password" 
              className="input-field" 
              placeholder="Digite o AuthToken..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            <Key size={16} /> Conectar e Sincronizar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#030303', position: 'relative' }}>
      {/* Top Glow & Grid Fundo */}
      <div className="top-glow" />

      {/* Header Padrao */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-section">
            <div className="logo-container">
              <img src={Logo} alt="OWN" className="logo-img" />
            </div>
            <div>
              <div className="brand-title">
                OWN <span>RANKING</span>
              </div>
              <div className="brand-subtitle">Clientes Fidelimax</div>
            </div>
          </div>
          
          <div className="user-section">
            <div className="user-info">
              <div className="user-avatar-initials">{hubUserInitials}</div>
              <span style={{ opacity: 0.8 }} className="hidden sm:inline">Olá, {hubUserName}</span>
            </div>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 6 }} onClick={handleLogout}>
              <LogOut size={12} />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Main Loader State */}
        {loading ? (
          <div className="card loading-wrapper">
            <div className="spinner"></div>
            <div>
              <h3>Sincronizando consumidores...</h3>
              <p style={{ fontSize: '0.85rem', marginTop: 4 }}>Isso pode levar alguns instantes dependendo da quantidade de clientes.</p>
            </div>
            {progress.total > 0 && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f3f4f6' }}>
                  {progress.current} / {progress.total} clientes
                </span>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        ) : error ? (
          <div className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)' }}>
            <h3 style={{ color: '#ef4444', marginBottom: 8 }}>Ocorreu um erro</h3>
            <p>{error}</p>
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 16 }}
              onClick={() => fetchAllConsumers(token)}
            >
              Tentar Novamente
            </button>
          </div>
        ) : consumers.length === 0 ? (
          <div className="card empty-state">
            <Users size={48} className="empty-state-icon" />
            <h3>Nenhum cliente carregado</h3>
            <p style={{ marginTop: 8 }}>Clique no botão abaixo para puxar a lista de consumidores da Fidelimax.</p>
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 20 }}
              onClick={() => fetchAllConsumers(token)}
            >
              Sincronizar Agora
            </button>
          </div>
        ) : (
          <>
            {/* Top Podium (Medalists) */}
            {selectedLoja === 'all' && searchQuery === '' && topThree.length > 0 && (
              <div>
                <h2 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={22} color="#e10600" />
                  Líderes de Fidelidade (Top 3)
                </h2>
                <div className="podium-section">
                  {/* 2nd Place (Silver) */}
                  {topThree[1] && (
                    <div className="podium-card silver">
                      <div className="podium-rank">2</div>
                      <Medal size={32} color="#9ca3af" style={{ marginBottom: 8 }} />
                      <div className="podium-name" title={topThree[1].nome}>{topThree[1].nome}</div>
                      <div className="podium-points">{topThree[1].displayPoints}</div>
                      <div className="podium-label">Pontos</div>
                    </div>
                  )}

                  {/* 1st Place (Gold) */}
                  {topThree[0] && (
                    <div className="podium-card gold">
                      <div className="podium-rank">1</div>
                      <Trophy size={48} color="#f59e0b" style={{ marginBottom: 8, filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.4))' }} />
                      <div className="podium-name" title={topThree[0].nome} style={{ fontSize: '1.2rem', fontWeight: 700 }}>{topThree[0].nome}</div>
                      <div className="podium-points" style={{ fontSize: '1.8rem' }}>{topThree[0].displayPoints}</div>
                      <div className="podium-label">Pontos</div>
                    </div>
                  )}

                  {/* 3rd Place (Bronze) */}
                  {topThree[2] && (
                    <div className="podium-card bronze">
                      <div className="podium-rank">3</div>
                      <Medal size={32} color="#b45309" style={{ marginBottom: 8 }} />
                      <div className="podium-name" title={topThree[2].nome}>{topThree[2].nome}</div>
                      <div className="podium-points">{topThree[2].displayPoints}</div>
                      <div className="podium-label">Pontos</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stats Widgets */}
            <div className="stats-grid">
              <div className="stat-widget">
                <div className="stat-icon-wrapper">
                  <Users size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{filteredAndRankedConsumers.length}</span>
                  <span className="stat-label">Clientes Filtrados</span>
                </div>
              </div>

              <div className="stat-widget">
                <div className="stat-icon-wrapper" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                  <Award size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{totalStats.points}</span>
                  <span className="stat-label">Total de Pontos</span>
                </div>
              </div>
            </div>

            {/* Controls: Search, Store Filter, Export */}
            <div className="card" style={{ padding: 20 }}>
              <div className="controls-bar">
                {/* Search */}
                <div className="search-input-wrapper" style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input 
                    type="text"
                    className="input-field"
                    placeholder="Pesquisar cliente pelo nome..."
                    style={{ paddingLeft: 40 }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Loja Filter */}
                {lojasList.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Filter size={16} />
                    <select 
                      className="input-field" 
                      style={{ width: 180, cursor: 'pointer' }}
                      value={selectedLoja}
                      onChange={(e) => setSelectedLoja(e.target.value)}
                    >
                      <option value="all">Todas as Lojas</option>
                      {lojasList.map(loja => (
                        <option key={loja} value={loja}>{loja}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sync & CSV Export */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => fetchAllConsumers(token)}
                    disabled={loading}
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Sincronizar
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={exportToCSV}
                    disabled={filteredAndRankedConsumers.length === 0}
                  >
                    <Download size={16} />
                    Exportar CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Leaderboard Ranking Table */}
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '80px', textAlign: 'center' }}>Posição</th>
                    <th>Cliente</th>
                    <th style={{ width: '250px' }}>Filiais / Pontuações</th>
                    <th 
                      style={{ width: '160px', textAlign: 'right', cursor: 'pointer' }} 
                      onClick={handleSort}
                    >
                      Pontos {sortOrder === 'desc' ? '▼' : '▲'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndRankedConsumers.map((customer, index) => {
                    const pos = index + 1;
                    const isTop3 = pos <= 3 && selectedLoja === 'all' && searchQuery === '';
                    
                    return (
                      <tr key={index} className={isTop3 ? 'top3-row' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`position-badge ${
                            pos === 1 && selectedLoja === 'all' && searchQuery === '' ? 'pos-1' :
                            pos === 2 && selectedLoja === 'all' && searchQuery === '' ? 'pos-2' :
                            pos === 3 && selectedLoja === 'all' && searchQuery === '' ? 'pos-3' : 'pos-other'
                          }`}>
                            {pos}
                          </span>
                        </td>
                        <td>
                          <div className="customer-name">{customer.nome || 'Sem Nome'}</div>
                          <div className="customer-email">
                            {customer.email || 'E-mail indisponível'} {customer.telefone && `• ${customer.telefone}`}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem', opacity: 0.8 }} title={customer.lojasList}>
                          <div style={{
                            maxWidth: '220px', whiteSpace: 'nowrap', 
                            overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>
                            {customer.lojasList}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="points-cell">
                          {customer.displayPoints}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredAndRankedConsumers.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                        Nenhum resultado corresponde aos filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        OWN BARBER CLUB • FIDELIMAX INTEGRATION • {new Date().getFullYear()}
      </footer>
    </div>
  );
}
