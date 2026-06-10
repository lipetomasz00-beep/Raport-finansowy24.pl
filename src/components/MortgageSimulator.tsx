import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Calculator, Save, TrendingUp, AlertCircle, ArrowLeft, Home, Zap, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { getAiRecommendedOffers, Offer } from '../services/aiOfferService';
import { AiOfferRecommendations } from './AiOfferRecommendations';

export function MortgageSimulator() {
  const navigate = useNavigate();
  const [propertyValue, setPropertyValue] = useState<number>(500000);
  const [downPayment, setDownPayment] = useState<number>(100000);
  const [years, setYears] = useState<number>(25);
  const [interestRate, setInterestRate] = useState<number>(7.5);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [matchedOffer, setMatchedOffer] = useState<Offer | null>(null);
  const [isMatching, setIsMatching] = useState(false);

  // Pobieranie lub tworzenie ID urządzenia
  const getDeviceId = () => {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('device_id', id);
    }
    return id;
  };

  // Ładowanie preferencji przy starcie
  useEffect(() => {
    const fetchPreferences = async () => {
      if (!isSupabaseConfigured) {
        setIsLoaded(true);
        return;
      }
      try {
        const deviceId = getDeviceId();
        const { data, error } = await supabase
          .from('user_preferences')
          .select('interest_rate, years, property_value, down_payment')
          .eq('device_id', deviceId)
          .maybeSingle();
        
        if (data && !error) {
          if (data.interest_rate) setInterestRate(data.interest_rate);
          if (data.years) setYears(data.years);
          if (data.property_value) setPropertyValue(data.property_value);
          if (data.down_payment) setDownPayment(data.down_payment);
        }
      } catch (err) {
        console.error("Błąd pobierania preferencji:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    fetchPreferences();
  }, []);

  // Automatyczny zapis preferencji (debounced)
  useEffect(() => {
    if (!isLoaded || !isSupabaseConfigured) return;

    const savePreferences = async () => {
      try {
        const deviceId = getDeviceId();
        
        const { data: existing } = await supabase
          .from('user_preferences')
          .select('id')
          .eq('device_id', deviceId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('user_preferences')
            .update({
              interest_rate: interestRate,
              years: years,
              property_value: propertyValue,
              down_payment: downPayment,
              updated_at: new Date().toISOString()
            })
            .eq('device_id', deviceId);
        } else {
          await supabase
            .from('user_preferences')
            .insert([{
              device_id: deviceId,
              interest_rate: interestRate,
              years: years,
              property_value: propertyValue,
              down_payment: downPayment,
              updated_at: new Date().toISOString()
            }]);
        }
      } catch (err) {
        console.error("Błąd zapisu preferencji:", err);
      }
    };

    const timeoutId = setTimeout(() => {
      savePreferences();
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [interestRate, years, propertyValue, downPayment, isLoaded]);

  const loanAmount = propertyValue - downPayment;

  const schedule = useMemo(() => {
    if (loanAmount <= 0 || years <= 0 || interestRate <= 0) return [];

    const p = loanAmount;
    const r = interestRate / 100 / 12;
    const n = years * 12;
    
    const monthlyPayment = p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    
    let balance = p;
    const result = [];
    
    let yearlyPrincipal = 0;
    let yearlyInterest = 0;

    for (let month = 1; month <= n; month++) {
      const interestPayment = balance * r;
      const principalPayment = monthlyPayment - interestPayment;
      balance -= principalPayment;
      
      yearlyPrincipal += principalPayment;
      yearlyInterest += interestPayment;

      if (month % 12 === 0 || month === n) {
        result.push({
          year: Math.ceil(month / 12),
          kapital: Math.round(yearlyPrincipal),
          odsetki: Math.round(yearlyInterest),
          saldo: Math.max(0, Math.round(balance)),
        });
        yearlyPrincipal = 0;
        yearlyInterest = 0;
      }
    }
    
    return result;
  }, [loanAmount, years, interestRate]);

  const totalInterest = schedule.reduce((sum, year) => sum + year.odsetki, 0);
  const totalCost = loanAmount + totalInterest;
  const monthlyPayment = loanAmount > 0 && years > 0 && interestRate > 0 
    ? (loanAmount * (interestRate / 100 / 12) * Math.pow(1 + interestRate / 100 / 12, years * 12)) / (Math.pow(1 + interestRate / 100 / 12, years * 12) - 1)
    : 0;

  const [isChartReady, setIsChartReady] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsChartReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleMatchOffer = async () => {
    setIsMatching(true);
    setMatchedOffer(null);
    try {
      // Przygotuj dane dla AI na podstawie symulacji
      const quizData = {
        goal: 'house',
        amount: loanAmount.toString(),
        propertyValue: propertyValue.toString(),
        downPayment: downPayment.toString(),
        years: years.toString(),
        score: 'good' // Domyślnie dobra historia dla hipoteki
      };

      const recommendation = await getAiRecommendedOffers(quizData);
      setMatchedOffer(recommendation);
      
      // Automatycznie zaktualizuj oprocentowanie w symulacji na podstawie realnej oferty
      if (recommendation?.rrso) {
        const rate = parseFloat(recommendation.rrso.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (!isNaN(rate) && rate > 0) {
          setInterestRate(rate);
        }
      }
      
      // Przewiń do oferty
      setTimeout(() => {
        const element = document.getElementById('matched-offer-section');
        if (element) element.scrollIntoView({ behavior: 'smooth' });
      }, 100);

    } catch (err) {
      console.error("Błąd dopasowania oferty:", err);
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col items-center text-center space-y-2 mb-4">
        <button 
          onClick={() => navigate('/loan')}
          className="self-start flex items-center gap-2 text-white/30 hover:text-[#DC143C] transition-colors text-[10px] font-bold uppercase tracking-widest mb-4 group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          Wróć do analizy
        </button>
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DC143C]/10 border border-[#DC143C]/20 text-[#DC143C] text-[10px] font-bold uppercase tracking-widest mb-2">
          <Calculator size={12} />
          Wylicz Swoja Rate
        </div>
        <h2 className="text-3xl font-black text-white leading-none tracking-tighter uppercase italic">
          Wylicz Swoja Rate
        </h2>
      </div>

      {/* Main Calculator Card */}
      <div className="relative overflow-hidden rounded-[32px] bg-zinc-900 border border-white/10 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DC143C]/5 via-transparent to-transparent opacity-50"></div>
        
        <div className="p-6 space-y-6 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-4 group bg-black/30 p-4 rounded-2xl border border-white/5 hover:border-[#DC143C]/30 transition-colors sm:col-span-2">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white/40 uppercase font-black tracking-widest flex items-center gap-2">
                  <Home size={12} className="group-hover:text-[#DC143C] transition-colors" /> Wartość Nieruchomości
                </label>
                <div className="text-2xl font-black text-white group-hover:text-[#DC143C] transition-colors group-hover:drop-shadow-[0_0_12px_rgba(220,20,60,0.8)]">
                  {propertyValue.toLocaleString('pl-PL')} <span className="text-sm text-white/40">PLN</span>
                </div>
              </div>
              <div className="relative pt-2 pb-2">
                <input 
                  type="range" 
                  min="50000" 
                  max="5000000" 
                  step="10000"
                  value={propertyValue}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setPropertyValue(val);
                    if (downPayment > val) setDownPayment(val);
                  }}
                  className="w-full h-2 bg-white/10 rounded-lg glow-slider"
                  style={{
                    background: `linear-gradient(to right, #DC143C ${(propertyValue - 50000) / (5000000 - 50000) * 100}%, rgba(255,255,255,0.1) ${(propertyValue - 50000) / (5000000 - 50000) * 100}%)`
                  }}
                />
              </div>
            </div>

            <div className="space-y-4 group bg-black/30 p-4 rounded-2xl border border-white/5 hover:border-[#DC143C]/30 transition-colors">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white/40 uppercase font-black tracking-widest flex items-center gap-2">
                  <Zap size={12} className="group-hover:text-[#DC143C] transition-colors" /> Wkład Własny
                </label>
                <div className="text-2xl font-black text-white group-hover:text-[#DC143C] transition-colors group-hover:drop-shadow-[0_0_12px_rgba(220,20,60,0.8)]">
                  {downPayment.toLocaleString('pl-PL')} <span className="text-sm text-white/40">PLN</span>
                </div>
              </div>
              <div className="relative pt-2 pb-2">
                <input 
                  type="range" 
                  min="0" 
                  max={propertyValue} 
                  step="5000"
                  value={downPayment}
                  onChange={(e) => setDownPayment(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg glow-slider"
                  style={{
                    background: `linear-gradient(to right, #DC143C ${propertyValue > 0 ? (downPayment / propertyValue) * 100 : 0}%, rgba(255,255,255,0.1) ${propertyValue > 0 ? (downPayment / propertyValue) * 100 : 0}%)`
                  }}
                />
              </div>
            </div>

            <div className="space-y-4 group bg-black/30 p-4 rounded-2xl border border-white/5 hover:border-[#DC143C]/30 transition-colors">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white/40 uppercase font-black tracking-widest flex items-center gap-2">
                  <Clock size={12} className="group-hover:text-[#DC143C] transition-colors" /> Okres Spłaty
                </label>
                <div className="text-2xl font-black text-white group-hover:text-[#DC143C] transition-colors group-hover:drop-shadow-[0_0_12px_rgba(220,20,60,0.8)]">
                  {years} <span className="text-sm text-white/40">LATA</span>
                </div>
              </div>
              <div className="relative pt-2 pb-2">
                <input 
                  type="range" 
                  min="1" 
                  max="35" 
                  step="1"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg glow-slider"
                  style={{
                    background: `linear-gradient(to right, #DC143C ${(years - 1) / (35 - 1) * 100}%, rgba(255,255,255,0.1) ${(years - 1) / (35 - 1) * 100}%)`
                  }}
                />
              </div>
            </div>

            <div className="space-y-4 group bg-black/30 p-4 rounded-2xl border border-white/5 hover:border-[#DC143C]/30 transition-colors sm:col-span-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-white/40 uppercase font-black tracking-widest flex items-center gap-2">
                  <Calculator size={12} className="group-hover:text-[#DC143C] transition-colors" /> Kwota Kredytu
                </label>
                <div className="text-2xl font-black text-white group-hover:text-[#DC143C] transition-colors group-hover:drop-shadow-[0_0_12px_rgba(220,20,60,0.8)]">
                  {loanAmount.toLocaleString('pl-PL')} <span className="text-sm text-white/40">PLN</span>
                </div>
              </div>
            </div>
          </div>

          {/* Result Summary */}
          <div className="bg-[#DC143C]/10 rounded-3xl p-6 border border-[#DC143C]/20 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <span className="text-[10px] text-[#DC143C] uppercase font-black tracking-[0.2em] block mb-1">Miesięczna Rata</span>
              <p className="text-4xl font-black text-white tracking-tighter">
                {Math.round(monthlyPayment).toLocaleString('pl-PL')} <span className="text-xl text-white/40">zł</span>
              </p>
            </div>
            <button 
              onClick={handleMatchOffer}
              disabled={isMatching}
              className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#DC143C] hover:bg-[#FF0000] text-white px-8 py-5 rounded-2xl font-black uppercase tracking-tighter shadow-[0_10px_20px_rgba(220,20,60,0.3)] transition-all disabled:opacity-50 active:scale-95"
            >
              {isMatching ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Zap size={20} /> Dopasuj Ofertę</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Matched Offer Result */}
      {matchedOffer && (
        <div id="matched-offer-section" className="mt-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <AiOfferRecommendations offers={[matchedOffer]} />
        </div>
      )}

      {/* Charts Section */}
      {schedule.length > 0 && (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-[32px] bg-zinc-900 border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[#DC143C]/10 flex items-center justify-center text-[#DC143C]">
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Struktura Raty</h3>
                <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Podział na kapitał i odsetki</p>
              </div>
            </div>
            <div className="h-[250px] w-full text-[10px] font-bold">
              {isChartReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <BarChart data={schedule} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis dataKey="year" stroke="#ffffff20" tick={{fill: '#ffffff30'}} />
                    <YAxis stroke="#ffffff20" tick={{fill: '#ffffff30'}} tickFormatter={(val) => `${val / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      cursor={{ fill: 'rgba(220,20,60,0.05)' }}
                      formatter={(value: number) => [`${value.toLocaleString('pl-PL')} zł`, '']}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '9px' }} />
                    <Bar dataKey="kapital" name="Kapitał" stackId="a" fill="#ffffff" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="odsetki" name="Odsetki" stackId="a" fill="#DC143C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[32px] bg-zinc-900 border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[#DC143C]/10 flex items-center justify-center text-[#DC143C]">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Spadek Zadłużenia</h3>
                <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Progresja spłaty kapitału</p>
              </div>
            </div>
            <div className="h-[250px] w-full text-[10px] font-bold">
              {isChartReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <LineChart data={schedule} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis dataKey="year" stroke="#ffffff20" tick={{fill: '#ffffff30'}} />
                    <YAxis stroke="#ffffff20" tick={{fill: '#ffffff30'}} tickFormatter={(val) => `${val / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      formatter={(value: number) => [`${value.toLocaleString('pl-PL')} zł`, 'Saldo']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="saldo" 
                      stroke="#DC143C" 
                      strokeWidth={4} 
                      dot={false} 
                      activeDot={{ r: 6, fill: '#DC143C', stroke: '#fff', strokeWidth: 2 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
