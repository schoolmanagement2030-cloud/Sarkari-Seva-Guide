import { useState, useEffect, Component, ErrorInfo, ReactNode, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Share2, ExternalLink, MessageCircle, X, Send, Menu, Bell, Download, Loader2, Info, AlertTriangle, Plus, Trash2, CheckCircle2, RefreshCw, Sparkles, Volume2, MoreVertical, Mail, ShieldAlert, Users, Home, List, MapPin, LayoutGrid, Link2Off, BarChart3, ShieldCheck } from 'lucide-react';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { collection, query, orderBy, onSnapshot, limit, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { getSchemeGuidance, enhanceSchemeWithAI, analyzeAndExtract } from './lib/gemini';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';
import { Routes, Route } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// --- Interfaces ---
interface Scheme {
  id: string;
  title: string;
  description: string;
  link: string;
  category: string;
  state: string;
  publishedAt: string;
  source: string;
  isAI?: boolean;
  isAIProcessed?: boolean;
  isDeadLink?: boolean;
  type?: 'Scheme' | 'Job';
}

interface Job {
  id: string;
  title: string;
  description: string;
  companyName?: string;
  location?: string;
  eligibility: string;
  lastDate: string;
  link: string;
  type: 'Government' | 'Private';
  publishedAt: string;
  source?: string;
}

interface Log {
  id: string;
  action: string;
  adminEmail: string;
  timestamp: any;
  details: string;
}

interface PendingContent extends Scheme {
  aiConfidence: number;
  aiReasoning: string;
  status: 'raw' | 'pending' | 'approved' | 'rejected';
  eligibility?: string;
  lastDate?: string;
  jobType?: string;
  companyName?: string;
  location?: string;
}

// --- Error Handling Logic ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function SidebarItem({ icon, label, onClick }: { icon: ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl p-4 text-left font-bold text-gray-700 transition-all hover:bg-blue-50 hover:text-blue-800 active:scale-95"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600">
        {icon}
      </div>
      <span>{label}</span>
    </button>
  );
}

function useVisitTracker() {
  useEffect(() => {
    const trackVisit = async () => {
      const lastVisit = localStorage.getItem('last_visit_timestamp');
      const now = Date.now();
      
      // Only track once every 10 minutes
      if (lastVisit && now - parseInt(lastVisit) < 10 * 60 * 1000) {
        return;
      }

      let visitorId = localStorage.getItem('visitor_id');
      if (!visitorId) {
        visitorId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('visitor_id', visitorId);
      }

      const deviceType = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
      const browser = navigator.userAgent.split(' ').pop();

      try {
        await addDoc(collection(db, 'visits'), {
          visitorId,
          timestamp: serverTimestamp(),
          deviceType,
          browser,
        });
        localStorage.setItem('last_visit_timestamp', now.toString());
      } catch (error) {
        console.error("Tracking Error:", error);
      }
    };

    trackVisit();
  }, []);
}

function AdminDashboard() {
  const [visits, setVisits] = useState<any[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qVisits = query(collection(db, 'visits'), orderBy('timestamp', 'desc'));
    const qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(20));
    
    const unsubVisits = onSnapshot(qVisits, (snapshot) => {
      setVisits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp?.toDate() })));
    });

    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log)));
      setLoading(false);
    });

    return () => {
      unsubVisits();
      unsubLogs();
    };
  }, []);

  const stats = useMemo(() => {
    const total = visits.length;
    const unique = new Set(visits.map(v => v.visitorId)).size;
    const today = visits.filter(v => {
      const d = new Date();
      return v.timestamp && v.timestamp.toDateString() === d.toDateString();
    }).length;

    const dailyData: any = {};
    visits.forEach(v => {
      if (v.timestamp) {
        const date = v.timestamp.toLocaleDateString();
        dailyData[date] = (dailyData[date] || 0) + 1;
      }
    });

    const chartData = Object.keys(dailyData).map(date => ({ date, visits: dailyData[date] })).reverse().slice(-7);

    return { total, unique, today, chartData };
  }, [visits]);

  const handleSetAdmin = async () => {
    const email = prompt("Enter email to set admin claim:");
    if (!email) return;
    try {
      const res = await fetch('/api/admin/set-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      console.log(data.message || data.error);
    } catch (err) {
      console.error("Error setting admin claim");
    }
  };

  if (loading) return <div className="flex h-[400px] items-center justify-center"><Loader2 className="animate-spin text-blue-800 h-12 w-12" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-blue-800 p-3 rounded-2xl text-white">
            <BarChart3 className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-blue-900">AI Admin Agent Control</h1>
            <p className="text-sm font-bold text-gray-500">Monitoring & Security Center</p>
          </div>
        </div>
        <button 
          onClick={handleSetAdmin}
          className="rounded-xl bg-blue-800 px-6 py-3 font-black text-white shadow-lg hover:bg-blue-900"
        >
          Set Admin Claim
        </button>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3">
        {/* ... stats cards ... */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-white p-6 shadow-xl border border-blue-50">
          <p className="text-sm font-bold text-gray-500 uppercase">Total Visitors</p>
          <p className="text-4xl font-black text-blue-800 mt-2">{stats.total}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl bg-white p-6 shadow-xl border border-blue-50">
          <p className="text-sm font-bold text-gray-500 uppercase">Unique Users</p>
          <p className="text-4xl font-black text-green-600 mt-2">{stats.unique}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl bg-white p-6 shadow-xl border border-blue-50">
          <p className="text-sm font-bold text-gray-500 uppercase">Today's Visits</p>
          <p className="text-4xl font-black text-orange-600 mt-2">{stats.today}</p>
        </motion.div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* ... charts ... */}
        <div className="rounded-3xl bg-white p-6 shadow-xl border border-blue-50">
          <h2 className="mb-6 text-xl font-black text-gray-900">Visits Trend</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="visits" stroke="#1e40af" strokeWidth={4} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-xl border border-blue-50">
          <h2 className="mb-6 text-xl font-black text-gray-900">Recent Admin Logs</h2>
          <div className="space-y-4 max-h-[300px] overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-black text-blue-800 uppercase">{log.action}</span>
                  <span className="text-[10px] text-gray-400">{log.timestamp?.toDate().toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-600 font-bold">{log.details}</p>
                <p className="text-[10px] text-gray-400 mt-1">By: {log.adminEmail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SchemeDetailPage({ schemes, handleShare, isAdmin, setEditingScheme, handleDelete }: { schemes: Scheme[], handleShare: (s: Scheme) => void, isAdmin: boolean, setEditingScheme: (s: Scheme) => void, handleDelete: (id: string) => void }) {
  const { id } = useParams();
  const [scheme, setScheme] = useState<Scheme | undefined>(schemes.find(s => s.id === id));
  const navigate = useNavigate();

  useEffect(() => {
    if (!scheme && id) {
      const fetchScheme = async () => {
        const docRef = doc(db, 'schemes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setScheme({ id: docSnap.id, ...docSnap.data() } as Scheme);
        }
      };
      fetchScheme();
    }
  }, [id, scheme]);

  if (!scheme) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-16 w-16 text-blue-800 animate-spin mb-4" />
        <h2 className="text-2xl font-black text-blue-900">योजना लोड हो रही है...</h2>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden"
    >
      <div className="relative h-64 sm:h-96">
        <img
          src={`https://picsum.photos/seed/${scheme.id}/1200/800`}
          alt={scheme.title}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-6 left-6 rounded-full bg-white/20 p-3 backdrop-blur-md text-white hover:bg-white/30"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="p-8 sm:p-12">
        <div className="flex flex-wrap gap-3 mb-6">
          <span className="rounded-xl bg-blue-100 px-4 py-1.5 text-sm font-black text-blue-800 uppercase">
            {scheme.category}
          </span>
          <span className="rounded-xl bg-gray-100 px-4 py-1.5 text-sm font-black text-gray-600 uppercase">
            {scheme.state}
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-8 leading-tight">
          {scheme.title}
        </h1>

        <div className="markdown-body prose prose-lg max-w-none mb-12">
          <Markdown>{scheme.description}</Markdown>
        </div>

        <div className="rounded-3xl bg-orange-50 p-6 mb-12 ring-1 ring-orange-200">
          <div className="flex gap-4">
            <Info className="h-6 w-6 shrink-0 text-orange-600" />
            <p className="text-sm font-bold leading-relaxed text-orange-800">
              अस्वीकरण: यह जानकारी केवल सूचनात्मक उद्देश्यों के लिए है। आवेदन करने से पहले आधिकारिक सरकारी वेबसाइट पर विवरण सत्यापित करें।
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => handleShare(scheme)}
            className="flex items-center justify-center gap-3 rounded-2xl bg-green-600 px-8 py-4 font-black text-white shadow-lg shadow-green-200 hover:bg-green-700 transition-all active:scale-95"
          >
            <Share2 className="h-6 w-6" /> व्हाट्सएप पर शेयर करें
          </button>
          <a
            href={scheme.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-3 rounded-2xl bg-blue-800 px-8 py-4 font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-900 transition-all active:scale-95"
          >
            आधिकारिक वेबसाइट पर जाएं <ExternalLink className="h-6 w-6" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// --- Error Boundary ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, errorInfo: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "कुछ गलत हो गया। कृपया पेज रिफ्रेश करें।";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '');
        if (parsed.error && parsed.error.includes('permission')) {
          displayMessage = "आपके पास इस जानकारी को देखने या बदलने की अनुमति नहीं है।";
        }
      } catch (e) {}

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
          <AlertTriangle className="mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-2 text-2xl font-bold text-gray-900">त्रुटि (Error)</h1>
          <p className="mb-6 text-gray-600">{displayMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-800 px-6 py-2 font-bold text-white hover:bg-blue-900"
          >
            दोबारा प्रयास करें
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}



function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 shadow-2xl border border-blue-50">
        <h1 className="text-4xl font-black text-blue-900 mb-6">हमारे बारे में / About Us</h1>
        <div className="space-y-6 text-gray-600 font-bold leading-relaxed">
          <p>
            <strong>Sarkari Seva Guide</strong> एक स्वतंत्र डिजिटल प्लेटफॉर्म है जिसका उद्देश्य भारतीय नागरिकों को नवीनतम सरकारी योजनाओं और नौकरियों के बारे में सटीक और समय पर जानकारी प्रदान करना है।
          </p>
          <p>
            हमारा मिशन जटिल सरकारी सूचनाओं को सरल बनाना है ताकि हर कोई अपने अधिकारों और अवसरों का लाभ उठा सके। हम सूचनाओं को आधिकारिक स्रोतों जैसे PIB, सरकारी राजपत्रों और आधिकारिक पोर्टलों से एकत्रित करते हैं।
          </p>
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
            <h2 className="text-xl font-black text-blue-800 mb-3">कानूनी अस्वीकरण / Legal Disclaimer</h2>
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li>हम एक स्वतंत्र मंच हैं और किसी भी सरकारी निकाय का हिस्सा नहीं हैं।</li>
              <li>हम केवल सूचना साझा करते हैं और किसी भी त्रुटि के लिए जिम्मेदार नहीं हैं।</li>
              <li>उपयोगकर्ताओं को किसी भी वित्तीय लेनदेन या आवेदन से पहले आधिकारिक वेबसाइटों की जांच करनी चाहिए।</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else setStatus('error');
    } catch (err) { setStatus('error'); }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 shadow-2xl border border-blue-50">
        <h1 className="text-3xl font-black text-blue-900 mb-2">संपर्क करें / Contact Us</h1>
        <p className="text-gray-500 font-bold mb-8">किसी भी सुधार या जानकारी के लिए हमें संदेश भेजें।</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-1">नाम / Name</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 font-bold focus:ring-2 focus:ring-blue-800 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-1">ईमेल / Email</label>
            <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 font-bold focus:ring-2 focus:ring-blue-800 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-1">विषय / Subject</label>
            <input type="text" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 font-bold focus:ring-2 focus:ring-blue-800 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-1">संदेश / Message</label>
            <textarea required rows={4} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 font-bold focus:ring-2 focus:ring-blue-800 outline-none" />
          </div>
          <button disabled={status === 'sending'} className="w-full rounded-xl bg-blue-800 py-4 font-black text-white shadow-lg hover:bg-blue-900 disabled:opacity-50">
            {status === 'sending' ? 'भेज रहा है...' : 'संदेश भेजें / Send Message'}
          </button>
          {status === 'success' && <p className="text-center text-green-600 font-bold">आपका संदेश सफलतापूर्वक प्राप्त हुआ!</p>}
          {status === 'error' && <p className="text-center text-red-600 font-bold">कुछ गलत हुआ। कृपया पुनः प्रयास करें।</p>}
        </form>
      </motion.div>
    </div>
  );
}



const ALL_STATES = [
  "All India",
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", 
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", 
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

function WarningTicker() {
  const tickerText = "महत्वपूर्ण सूचना / Important Notice: यह एक स्वतंत्र मंच है और किसी भी सरकारी संस्था से संबद्ध नहीं है। हम सार्वजनिक रूप से उपलब्ध स्रोतों के आधार पर जानकारी प्रदान करते हैं। हम सटीकता की गारंटी नहीं देते हैं। उपयोगकर्ताओं को आवेदन करने से पहले आधिकारिक स्रोतों से विवरण सत्यापित करना चाहिए. | This website is NOT a government website. We provide information based on publicly available sources. We do not guarantee accuracy. Users must verify details from official sources before applying.";

  return (
    <div className="fixed bottom-0 left-0 z-[90] w-full border-t border-[#ffeeba] bg-[#fff3cd] py-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
      <div className="relative flex overflow-hidden whitespace-nowrap">
        <div className="animate-marquee flex items-center gap-4 hover:[animation-play-state:paused]">
          <span className="text-[13px] font-medium tracking-wide text-[#856404]">
            ⚠ {tickerText} &nbsp;&nbsp;&nbsp;&nbsp; ⚠ {tickerText}
          </span>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useVisitTracker();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Central');
  const [selectedState, setSelectedState] = useState(localStorage.getItem('selectedState') || 'All India');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);
  const [lastSeenCount, setLastSeenCount] = useState(Number(localStorage.getItem('lastSeenCount') || 0));
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      console.log("Fetched Data:", data);
      if (data.schemes) setSchemes(data.schemes);
      if (data.jobs) setJobs(data.jobs);
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('selectedState', selectedState);
  }, [selectedState]);

  const states = ALL_STATES;
  const categories = [
    { id: 'Central', label: 'Central Schemes', icon: '🏛️' },
    { id: 'State', label: 'State Schemes', icon: '📍' },
    { id: 'Jobs', label: 'Jobs/Education', icon: '🎓' }
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setIsAuthReady(true);
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-AI Processing removed - now handled autonomously by backend

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (data.success) {
        console.log(`${data.added} नई योजनाएं जोड़ी गईं!`);
      } else {
        console.error("सिंक करने में त्रुटि हुई।");
      }
    } catch (error) {
      console.error("सर्वर से संपर्क नहीं हो पाया।");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const isAdmin = user?.email === "vinas23metro2@gmail.com";

  const filteredSchemes = schemes.length > 0 
    ? schemes.filter(s => {
        const title = s.title || "";
        const description = s.description || "";
        const category = s.category || "Central"; // Default to Central if missing
        const state = s.state || "All India"; // Default to All India if missing

        const matchesSearch = title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             description.toLowerCase().includes(searchTerm.toLowerCase());
        
        const isCentral = category === 'Central' || state === 'All India';
        const isSelectedState = state === selectedState;
        
        const matchesCategory = selectedCategory === 'Central' 
          ? isCentral 
          : (category === selectedCategory);

        const matchesState = (selectedState === 'All India') || isCentral || isSelectedState;
        
        return matchesSearch && matchesCategory && matchesState;
      })
    : [];

  const filteredJobs = jobs.length > 0
    ? jobs.filter(j => {
        const matchesSearch = j.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             j.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      })
    : [];

  const flashNews = schemes.slice(0, 8);

  const isRecent = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return diffInHours < 24;
  };

  const newSchemesCount = schemes.filter(s => isRecent(s.publishedAt)).length;
  const unreadCount = Math.max(0, newSchemesCount - lastSeenCount);

  const handleBellClick = () => {
    setIsNotificationsOpen(true);
    setLastSeenCount(newSchemesCount);
    localStorage.setItem('lastSeenCount', String(newSchemesCount));
  };

  const handleShareApp = async () => {
    const shareData = {
      title: 'Sarkari Seva Guide',
      text: 'सरकारी योजनाओं की ताज़ा जानकारी के लिए इस ऐप को देखें!',
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        console.log("ऐप लिंक कॉपी कर लिया गया है!");
      }
    } catch (err) {
      console.error("Share error:", err);
    }
    setIsMenuOpen(false);
  };

  const handleEditScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScheme) return;
    try {
      await updateDoc(doc(db, 'schemes', editingScheme.id), {
        title: editingScheme.title,
        description: editingScheme.description,
        category: editingScheme.category,
        state: editingScheme.state
      });
      setEditingScheme(null);
      console.log("योजना अपडेट कर दी गई है!");
    } catch (error) {
      console.error("अपडेट करने में त्रुटि हुई।");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("क्या आप वाकई इस योजना को हटाना चाहते हैं?")) return;
    try {
      await deleteDoc(doc(db, 'schemes', id));
    } catch (error) {
      console.error("हटाने में त्रुटि हुई।");
    }
  };

  const handleShare = async (scheme: Scheme) => {
    const appUrl = window.location.origin;
    const shareUrl = `${appUrl}/scheme/${scheme.id}`;
    const shareData = {
      title: scheme.title,
      text: `देखिये सरकार की नई योजना [${scheme.title}]! पूरी जानकारी और आवेदन के लिए अभी सरकारी सेवा गाइड ऐप पर आएं:`,
      url: shareUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareUrl}`);
        console.log("शेयर लिंक कॉपी कर लिया गया है!");
      }
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');

    try {
      const context = schemes.slice(0, 5).map(s => s.title).join(', ');
      const aiResponse = await getSchemeGuidance(userMsg, context);
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse || 'माफी चाहता हूँ, मैं अभी जवाब नहीं दे पा रहा हूँ।' }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'त्रुटि: कृपया बाद में प्रयास करें।' }]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Flash News Banner */}
      {flashNews.length > 0 && (
        <div className="bg-gradient-to-r from-orange-600 via-red-600 to-orange-600 text-white py-2.5 overflow-hidden relative shadow-md border-b border-white/10">
          <div className="flex whitespace-nowrap animate-marquee items-center">
            {flashNews.map((news, i) => (
              <span key={i} className="mx-10 flex items-center gap-3 font-bold text-sm tracking-wide">
                <span className="bg-white text-red-600 px-2 py-0.5 rounded text-[10px] uppercase tracking-tighter animate-pulse">New</span>
                <Sparkles className="h-4 w-4 text-yellow-300" />
                ताज़ा अपडेट: {news.title}
              </span>
            ))}
            {flashNews.map((news, i) => (
              <span key={`dup-${i}`} className="mx-10 flex items-center gap-3 font-bold text-sm tracking-wide">
                <span className="bg-white text-red-600 px-2 py-0.5 rounded text-[10px] uppercase tracking-tighter animate-pulse">New</span>
                <Sparkles className="h-4 w-4 text-yellow-300" />
                ताज़ा अपडेट: {news.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-blue-800 text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="rounded-full p-2 hover:bg-blue-700 transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
              <Link to="/" className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg">
                  <div className="h-6 w-6 rounded-full bg-blue-800" />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight leading-none">SARKARI SEVA</h1>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Guide 2026</span>
                </div>
              </Link>
            </div>
            <div className="hidden flex-1 px-8 md:block">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="योजना खोजें..."
                  className="w-full rounded-full bg-white/10 py-2 pl-10 pr-4 text-white placeholder-white/60 outline-none focus:bg-white/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <button 
                  onClick={handleSync} 
                  disabled={isSyncing}
                  className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20"
                >
                  <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                  {isSyncing ? "सिंक हो रहा है..." : "डेटा सिंक करें"}
                </button>
              )}
              {deferredPrompt && (
                <button onClick={handleInstall} className="flex items-center gap-1 rounded-full bg-orange-500 px-3 py-1 text-sm font-medium hover:bg-orange-600">
                  <Download className="h-4 w-4" /> इंस्टॉल
                </button>
              )}
              <div className="relative">
                <Bell className="h-6 w-6 cursor-pointer" onClick={handleBellClick} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-blue-800">
                    {unreadCount}
                  </span>
                )}
              </div>

              <div className="relative">
                <MoreVertical className="h-6 w-6 cursor-pointer" onClick={() => setIsMenuOpen(!isMenuOpen)} />
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-white p-2 shadow-2xl ring-1 ring-black/5"
                    >
                      <button onClick={handleShareApp} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100">
                        <Share2 className="h-4 w-4" /> Share App
                      </button>
                      <button onClick={() => { setIsAboutOpen(true); setIsMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100">
                        <Users className="h-4 w-4" /> About Us
                      </button>
                      <button onClick={() => { setIsPrivacyOpen(true); setIsMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100">
                        <ShieldAlert className="h-4 w-4" /> Privacy Policy
                      </button>
                      <button onClick={() => { setIsTermsOpen(true); setIsMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100">
                        <ShieldAlert className="h-4 w-4" /> Terms of Service
                      </button>
                      <a href="mailto:support@sarkarisevaguide.com" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100">
                        <Mail className="h-4 w-4" /> Contact Us
                      </a>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {!user ? (
                <button onClick={signInWithGoogle} className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-blue-800 hover:bg-gray-100">
                  लॉगिन
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="hidden flex-col items-end md:flex">
                    <span className="text-xs font-bold">{user.displayName}</span>
                    {isAdmin && <span className="text-[10px] font-black text-orange-400">ADMIN</span>}
                  </div>
                  <img src={user.photoURL || ''} alt="User" className="h-8 w-8 rounded-full border-2 border-white" referrerPolicy="no-referrer" />
                  <button 
                    onClick={handleLogout}
                    className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-500/40"
                  >
                    लॉगआउट
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="योजना खोजें..."
                className="w-full rounded-full bg-white/10 py-2 pl-10 pr-4 text-white placeholder-white/60 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-[80] w-80 bg-white shadow-2xl"
            >
              <div className="flex h-full flex-col">
                <div className="bg-blue-800 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-white p-2">
                        <div className="h-full w-full rounded-full bg-blue-800" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black">Sarkari Seva</h2>
                        <p className="text-xs font-bold text-blue-200">Guide 2026</p>
                      </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="rounded-full bg-blue-700 p-2">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  <SidebarItem icon={<Home className="h-5 w-5" />} label="🏠 होम (Home)" onClick={() => { navigate('/'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={<Info className="h-5 w-5" />} label="ℹ️ हमारे बारे में (About Us)" onClick={() => { navigate('/about'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={<Mail className="h-5 w-5" />} label="📞 संपर्क करें (Contact Us)" onClick={() => { navigate('/contact'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={<List className="h-5 w-5" />} label="📋 सभी योजनाएं (All Schemes)" onClick={() => { navigate('/'); setSelectedCategory('Central'); setSelectedState('All India'); setIsSidebarOpen(false); }} />
                  <SidebarItem icon={<MapPin className="h-5 w-5" />} label="📍 राज्य चुनें (Select State)" onClick={() => setShowStatePicker(!showStatePicker)} />
                  {showStatePicker && (
                    <div className="ml-10 grid grid-cols-1 gap-1 py-2 max-h-60 overflow-y-auto">
                      {ALL_STATES.map(s => (
                        <button key={s} onClick={() => { setSelectedState(s); setSelectedCategory('State'); navigate('/'); setIsSidebarOpen(false); }} className={cn("text-left text-sm py-2 px-3 rounded-lg hover:bg-gray-100 font-bold", selectedState === s ? "text-blue-800 bg-blue-50" : "text-gray-600")}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <SidebarItem icon={<LayoutGrid className="h-5 w-5" />} label="📑 श्रेणी (Categories)" onClick={() => setShowCategoryPicker(!showCategoryPicker)} />
                  {showCategoryPicker && (
                    <div className="ml-10 grid grid-cols-1 gap-1 py-2">
                      {categories.map(c => (
                        <button key={c.id} onClick={() => { setSelectedCategory(c.id); navigate('/'); setIsSidebarOpen(false); }} className={cn("text-left text-sm py-2 px-3 rounded-lg hover:bg-gray-100 font-bold", selectedCategory === c.id ? "text-blue-800 bg-blue-50" : "text-gray-600")}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="h-px bg-gray-100 my-4" />
                  {isAdmin && (
                    <>
                      <SidebarItem icon={<BarChart3 className="h-5 w-5" />} label="📊 एनालिटिक्स (Analytics)" onClick={() => { navigate('/admin/analytics'); setIsSidebarOpen(false); }} />
                    </>
                  )}
                  <SidebarItem icon={<Share2 className="h-5 w-5" />} label="📢 ऐप शेयर करें (Share App)" onClick={handleShareApp} />
                </div>

                <div className="p-6 border-t bg-gray-50">
                  <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Verified Information Hub
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="bg-white border-b sticky top-[64px] md:top-[72px] z-30">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all",
                    selectedCategory === cat.id 
                      ? "bg-blue-800 text-white shadow-md shadow-blue-200" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-500">राज्य चुनें:</span>
              <select 
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="rounded-lg border bg-gray-50 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-800"
              >
                {ALL_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={
            <>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-16 w-16 text-blue-800 animate-spin mb-4" />
                  <h2 className="text-2xl font-black text-blue-900">डेटा लोड हो रहा है...</h2>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedCategory === 'Jobs' ? (
                    filteredJobs.map((job) => (
                      <motion.div
                        key={job.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl"
                      >
                        <div className="p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <span className={cn("rounded-lg px-2 py-1 text-[10px] font-black text-white", job.type === 'Government' ? "bg-blue-800" : "bg-green-600")}>
                              {job.type} Job
                            </span>
                            <span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600">
                              Last Date: {job.lastDate}
                            </span>
                          </div>
                          <h3 className="mb-3 line-clamp-2 text-lg font-black leading-tight text-gray-900 group-hover:text-blue-800">
                            {job.title}
                          </h3>
                          <p className="mb-4 line-clamp-3 text-sm font-bold leading-relaxed text-gray-500">
                            {job.description}
                          </p>
                          <div className="mt-auto flex items-center justify-between border-t pt-4">
                            <div className="flex flex-col gap-1">
                              <a href={job.link} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-blue-800 hover:underline">
                                Apply Now →
                              </a>
                              <span className="text-[10px] font-bold text-gray-400">Source: {job.source || 'Official Portal'}</span>
                            </div>
                            <Link to="/contact" className="text-[10px] font-black text-red-400 hover:text-red-600">Report Error</Link>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    filteredSchemes.map((scheme) => (
                      <motion.div
                        key={scheme.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl"
                      >
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={`https://picsum.photos/seed/${scheme.id}/600/400`}
                            alt={scheme.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-4 left-4 flex gap-2">
                            <span className="rounded-lg bg-blue-800/80 px-2 py-1 text-[10px] font-black text-white backdrop-blur-md">
                              {scheme.category}
                            </span>
                            <span className="rounded-lg bg-white/20 px-2 py-1 text-[10px] font-black text-white backdrop-blur-md">
                              {scheme.state}
                            </span>
                          </div>
                          {scheme.isDeadLink && (
                            <div className="absolute top-4 right-4 bg-red-600 text-white px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-lg">
                              <Link2Off className="h-3 w-3" /> DEAD LINK
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-6">
                          <h3 className="mb-3 line-clamp-2 text-lg font-black leading-tight text-gray-900 group-hover:text-blue-800">
                            {scheme.title}
                          </h3>
                          <p className="mb-4 line-clamp-3 text-sm font-bold leading-relaxed text-gray-500">
                            {scheme.description.replace(/[#*`]/g, '')}
                          </p>
                          <div className="mt-auto flex items-center justify-between border-t pt-4">
                            <div className="flex flex-col gap-1">
                              <Link
                                to={`/scheme/${scheme.id}`}
                                className="text-sm font-black text-blue-800 hover:underline"
                              >
                                विवरण देखें →
                              </Link>
                              <span className="text-[10px] font-bold text-gray-400">Source: {scheme.source || 'Government Portal'}</span>
                            </div>
                            <div className="flex gap-2 items-center">
                              <Link to="/contact" className="text-[10px] font-black text-red-400 hover:text-red-600 mr-2">Report Error</Link>
                              <button
                                onClick={() => handleShare(scheme)}
                                className="rounded-full bg-gray-100 p-2 text-gray-400 hover:bg-green-50 hover:text-green-600"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {isRecent(scheme.publishedAt) && (
                          <div className="absolute -right-8 top-4 rotate-45 bg-red-600 px-10 py-1 text-[10px] font-black text-white shadow-md">
                            NEW
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              )}
              {!loading && filteredSchemes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-6 rounded-full bg-gray-100 p-8">
                    <Search className="h-16 w-16 text-gray-300" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900">कोई योजना नहीं मिली</h3>
                  <p className="mt-2 text-gray-500">कृपया अपनी खोज या फ़िल्टर बदलें।</p>
                  <button 
                    onClick={() => { setSearchTerm(''); setSelectedCategory('Central'); setSelectedState('All India'); }}
                    className="mt-6 rounded-2xl bg-blue-800 px-8 py-3 font-black text-white"
                  >
                    सभी योजनाएं देखें
                  </button>
                </div>
              )}
            </>
          } />
          <Route path="/scheme/:id" element={<SchemeDetailPage schemes={schemes} handleShare={handleShare} isAdmin={isAdmin} setEditingScheme={setEditingScheme} handleDelete={handleDelete} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/admin/analytics" element={isAdmin ? <AdminDashboard /> : <div className="p-20 text-center font-black text-red-600">Access Denied</div>} />
        </Routes>
      </main>

      {/* Floating AI Assistant */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="mb-4 w-80 overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 sm:w-96"
            >
              <div className="bg-blue-800 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-black">Sarkari AI Assistant</h3>
                      <p className="text-[10px] font-bold text-blue-200">हमेशा आपकी सेवा में</p>
                    </div>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="rounded-full p-1 hover:bg-white/10">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="h-80 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10">
                    <MessageCircle className="h-12 w-12 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm font-bold text-gray-400">नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm font-bold shadow-sm",
                      msg.role === 'user' ? "bg-blue-800 text-white" : "bg-white text-gray-800 border"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-4 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="सवाल पूछें..."
                    className="flex-1 rounded-xl border bg-gray-50 px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-800"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button 
                    onClick={handleSendMessage}
                    className="rounded-xl bg-blue-800 p-2 text-white hover:bg-blue-900"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-800 text-white shadow-2xl shadow-blue-200 transition-transform hover:scale-110 active:scale-95"
        >
          {isChatOpen ? <X className="h-8 w-8" /> : <MessageCircle className="h-8 w-8" />}
        </button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isNotificationsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-blue-900">सूचनाएं (Notifications)</h2>
                <button onClick={() => setIsNotificationsOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {schemes.slice(0, 5).map((s, i) => (
                  <div key={i} className="flex gap-4 p-3 rounded-2xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 line-clamp-2">{s.title}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-1">{new Date(s.publishedAt).toLocaleDateString('hi-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {isAboutOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl"
            >
              <h2 className="mb-4 text-3xl font-black text-blue-900">हमारे बारे में</h2>
              <p className="mb-6 text-sm font-bold leading-relaxed text-gray-600">
                Sarkari Seva Guide एक स्वतंत्र मंच है जिसका उद्देश्य भारत के नागरिकों को सरकारी योजनाओं, नौकरियों और छात्रवृत्तियों के बारे में जागरूक करना है। हम AI और आधुनिक तकनीक का उपयोग करके जटिल सरकारी सूचनाओं को सरल भाषा में आप तक पहुँचाते हैं।
              </p>
              <button onClick={() => setIsAboutOpen(false)} className="w-full rounded-2xl bg-blue-800 py-3 font-bold text-white hover:bg-blue-900">
                बंद करें
              </button>
            </motion.div>
          </div>
        )}

        {isPrivacyOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl"
            >
              <h2 className="mb-4 text-3xl font-black text-blue-900">Privacy Policy</h2>
              <div className="max-h-[50vh] overflow-y-auto pr-2 text-sm leading-relaxed text-gray-600">
                <p className="mb-4">हम आपकी गोपनीयता का सम्मान करते हैं। यह ऐप केवल आपकी प्राथमिकताओं (जैसे चुना गया राज्य) को स्टोर करने के लिए लोकल स्टोरेज का उपयोग करती है।</p>
                <p className="mb-4">Google लॉगिन का उपयोग केवल आपकी पहचान सत्यापित करने के लिए किया जाता है। हम आपका डेटा किसी तीसरे पक्ष को नहीं बेचते हैं।</p>
              </div>
              <button onClick={() => setIsPrivacyOpen(false)} className="mt-6 w-full rounded-2xl bg-blue-800 py-3 font-bold text-white hover:bg-blue-900">
                बंद करें
              </button>
            </motion.div>
          </div>
        )}

        {isTermsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl"
            >
              <h2 className="mb-4 text-3xl font-black text-blue-900">Terms of Service</h2>
              <div className="max-h-[50vh] overflow-y-auto pr-2 text-sm leading-relaxed text-gray-600">
                <p className="mb-4">1. सूचना की सटीकता: हम जानकारी को सटीक रखने का प्रयास करते हैं, लेकिन किसी भी त्रुटि के लिए उत्तरदायी नहीं हैं।</p>
                <p className="mb-4">2. उपयोग की शर्तें: इस ऐप का उपयोग केवल सूचनात्मक उद्देश्यों के लिए किया जाना चाहिए।</p>
                <p className="mb-4">3. सरकारी संबद्धता: हम फिर से स्पष्ट करते हैं कि हम कोई सरकारी संस्था नहीं हैं।</p>
                <p className="mb-4">4. बदलाव: हम किसी भी समय इन शर्तों को अपडेट करने का अधिकार सुरक्षित रखते हैं।</p>
              </div>
              <button onClick={() => setIsTermsOpen(false)} className="mt-6 w-full rounded-2xl bg-blue-800 py-3 font-bold text-white hover:bg-blue-900">
                सहमत हूँ
              </button>
            </motion.div>
          </div>
        )}

        {editingScheme && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl"
            >
              <h2 className="mb-6 text-2xl font-black text-blue-900">Edit Scheme</h2>
              <form onSubmit={handleEditScheme} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700">Title</label>
                  <input 
                    type="text" 
                    value={editingScheme.title}
                    onChange={(e) => setEditingScheme({...editingScheme, title: e.target.value})}
                    className="mt-1 w-full rounded-xl border bg-gray-50 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">Description (Markdown)</label>
                  <textarea 
                    rows={6}
                    value={editingScheme.description}
                    onChange={(e) => setEditingScheme({...editingScheme, description: e.target.value})}
                    className="mt-1 w-full rounded-xl border bg-gray-50 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-800"
                  />
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setEditingScheme(null)} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-600 hover:bg-gray-200">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 rounded-xl bg-blue-800 py-3 font-bold text-white hover:bg-blue-900">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="bg-gray-900 py-10 pb-20 text-white">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h2 className="mb-4 text-xl font-bold">Sarkari Seva Guide</h2>
              <p className="text-sm text-gray-400">
                हमारा उद्देश्य नागरिकों तक सरकारी योजनाओं की सही और सटीक जानकारी पहुँचाना है।
              </p>
            </div>
            <div>
              <h3 className="mb-4 font-bold">महत्वपूर्ण लिंक</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><button onClick={() => setIsAboutOpen(true)} className="hover:text-white">हमारे बारे में</button></li>
                <li><button onClick={() => setIsPrivacyOpen(true)} className="hover:text-white">गोपनीयता नीति</button></li>
                <li><button onClick={() => setIsTermsOpen(true)} className="hover:text-white">नियम और शर्तें</button></li>
                <li><a href="mailto:support@sarkarisevaguide.com" className="hover:text-white">संपर्क करें</a></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-bold">Verified Information</h3>
              <div className="flex items-center gap-2 rounded-xl bg-green-500/10 p-3 ring-1 ring-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-xs font-bold text-green-400">डेटा सीधे सरकारी न्यूज़ फीड (RSS) से सत्यापित है।</span>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-gray-800 pt-6 text-center text-xs text-gray-500">
            © 2026 Sarkari Seva Guide. सभी अधिकार सुरक्षित।
          </div>
        </div>
      </footer>
      <WarningTicker />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
