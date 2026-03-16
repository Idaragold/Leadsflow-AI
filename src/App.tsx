/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ReactNode } from 'react';
import { 
  LayoutDashboard, 
  Search, 
  Send, 
  Megaphone, 
  Settings, 
  LogOut, 
  Plus, 
  CheckCircle2, 
  Clock, 
  MessageSquare,
  TrendingUp,
  Users,
  Bell,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  MapPin,
  Briefcase,
  Sun,
  Moon,
  Bot,
  MessageCircle,
  BarChart3,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { User, Business, Lead, Campaign } from './types';
import { firebaseDb } from './db';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from './firebase';
import { findLeads, generateOutreach, generateCampaign } from './services/gemini';
import { PLAN_LIMITS } from './constants';

type Page = 'auth' | 'dashboard' | 'lead-finder' | 'outreach' | 'campaigns' | 'business-settings' | 'account-settings';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-xl text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">
              {this.state.error?.message?.includes('Firestore Error') 
                ? 'A database error occurred. Please check your permissions or contact support.' 
                : 'An unexpected error occurred.'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold transition-all"
            >
              Reload Application
            </button>
            <pre className="mt-6 p-4 bg-zinc-100 dark:bg-zinc-950 rounded-xl text-left text-xs overflow-auto max-h-40 text-zinc-600 dark:text-zinc-400">
              {this.state.error?.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('auth');
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });

  // Apply theme to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // Handle cross-component navigation
  useEffect(() => {
    const handlePageChange = (e: any) => {
      if (e.detail) setCurrentPage(e.detail);
    };
    window.addEventListener('changePage', handlePageChange);
    return () => window.removeEventListener('changePage', handlePageChange);
  }, []);

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await firebaseDb.getUser(firebaseUser.uid);
        if (userData) {
          setUser(userData);
          setCurrentPage('dashboard');
        } else {
          // New user from Google Login
          const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            plan: 'Free',
            paymentStatus: false
          };
          await firebaseDb.saveUser(newUser);
          setUser(newUser);
          setCurrentPage('dashboard');
        }
      } else {
        setUser(null);
        setCurrentPage('auth');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Data Subscriptions
  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Load businesses
    const fetchBusinesses = async () => {
      const results = await firebaseDb.getBusinesses(user.id);
      setBusinesses(results);
      if (results.length > 0 && !business) {
        setBusiness(results[0]);
      }
    };
    fetchBusinesses();

    // Subscribe to leads and campaigns
    const unsubLeads = firebaseDb.subscribeLeads(user.id, business?.id || null, setLeads);
    const unsubCampaigns = firebaseDb.subscribeCampaigns(user.id, business?.id || null, setCampaigns);

    return () => {
      unsubLeads();
      unsubCampaigns();
    };
  }, [user, isAuthReady, business]);

  // Handle payment redirect
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const newPlan = urlParams.get('plan') as User['plan'];
    
    if (paymentStatus === 'success' && newPlan) {
      firebaseDb.updateUserPlan(user.id, newPlan).then(() => {
        addNotification(`Successfully upgraded to ${newPlan} plan!`);
        // Clean up URL
        window.history.replaceState({}, document.title, "/");
      });
    }
  }, [user, isAuthReady]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
      alert('Login failed');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  const addNotification = (msg: string) => {
    setNotifications(prev => [msg, ...prev]);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Components
  const Sidebar = () => (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <TrendingUp className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">LeadFlow AI</span>
        </div>
        
        <nav className="space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'lead-finder', icon: Search, label: 'Lead Finder' },
            { id: 'outreach', icon: Send, label: 'Outreach' },
            { id: 'campaigns', icon: Megaphone, label: 'Campaigns' },
            { id: 'business-settings', icon: Briefcase, label: 'Business' },
            { id: 'account-settings', icon: Settings, label: 'Account' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentPage(item.id as Page);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPage === item.id ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white'}`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-zinc-200 dark:border-zinc-800">
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );

  if (currentPage === 'auth') {
    const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailError, setEmailError] = useState('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [resetSent, setResetSent] = useState(false);

    const validateEmail = (email: string) => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setEmailError('');

      if (!validateEmail(email)) {
        setEmailError('Please enter a valid email address.');
        return;
      }

      if (password.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
      }

      setIsAuthenticating(true);
      try {
        if (authMode === 'signup') {
          const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(userCredential.user, { displayName: email.split('@')[0] });
        } else {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          await signInWithEmailAndPassword(auth, email, password);
        }
      } catch (error: any) {
        console.error(error);
        alert(error.message || 'Authentication failed');
      } finally {
        setIsAuthenticating(false);
      }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) {
        setEmailError('Please enter your email address.');
        return;
      }
      setIsAuthenticating(true);
      try {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
      } catch (error: any) {
        console.error(error);
        alert(error.message || 'Failed to send reset email');
      } finally {
        setIsAuthenticating(false);
      }
    };

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <TrendingUp className="text-white w-8 h-8" />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-white text-center mb-2">LeadFlow AI</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-center mb-8">
            {authMode === 'reset' ? 'Reset your password' : 'One-click customer growth for your business'}
          </p>
          
          {authMode === 'reset' ? (
            resetSent ? (
              <div className="text-center space-y-6">
                <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20">
                  <p className="text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                    Check your email! We've sent a password reset link to <strong>{email}</strong>.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setAuthMode('login');
                    setResetSent(false);
                  }}
                  className="text-sm text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Email Address</label>
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    placeholder="you@example.com"
                    className={`w-full bg-zinc-50 dark:bg-zinc-950 border ${emailError ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors`}
                    required
                  />
                  {emailError && <p className="text-red-500 text-[10px] mt-1 ml-1 font-medium">{emailError}</p>}
                </div>
                <button 
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center"
                >
                  {isAuthenticating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
                <div className="text-center">
                  <button 
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setEmailError('');
                    }}
                    className="text-sm text-zinc-500 font-medium hover:text-zinc-900 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 ml-1">Email Address</label>
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    placeholder="you@example.com"
                    className={`w-full bg-zinc-50 dark:bg-zinc-950 border ${emailError ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors`}
                    required
                  />
                  {emailError && <p className="text-red-500 text-[10px] mt-1 ml-1 font-medium">{emailError}</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5 ml-1">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Password</label>
                    {authMode === 'login' && (
                      <button 
                        type="button"
                        onClick={() => setAuthMode('reset')}
                        className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center"
                >
                  {isAuthenticating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    authMode === 'login' ? 'Sign In' : 'Create Account'
                  )}
                </button>
              </form>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-zinc-900 px-2 text-zinc-500">Or continue with</span>
                </div>
              </div>
              
              <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
                Google Login
              </button>

              <div className="mt-8 text-center">
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-sm text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              </div>
            </>
          )}
          
          <p className="mt-6 text-center text-[10px] text-zinc-500 leading-relaxed">
            By signing in, you agree to our <span className="underline cursor-pointer">Terms of Service</span> and <span className="underline cursor-pointer">Privacy Policy</span>.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Sidebar />
      
      <main className="lg:ml-64 p-4 lg:p-8">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-zinc-500 dark:text-zinc-400">
              <Menu size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                {currentPage === 'dashboard' && 'Dashboard'}
                {currentPage === 'lead-finder' && 'AI Lead Finder'}
                {currentPage === 'outreach' && 'Customer Outreach'}
                {currentPage === 'campaigns' && 'Marketing Campaigns'}
                {currentPage === 'business-settings' && 'Business Settings'}
                {currentPage === 'account-settings' && 'Account Settings'}
              </h1>
              <p className="text-zinc-500 text-sm">Welcome back, {user?.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            
            {business && (
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-zinc-900 dark:text-white hover:border-emerald-500/50 transition-all">
                  <Briefcase size={16} className="text-emerald-500" />
                  <span className="max-w-[120px] truncate">{business.name}</span>
                  <ChevronDown size={14} className="text-zinc-400" />
                </button>
                
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[60] overflow-hidden">
                  <div className="p-2">
                    <p className="px-3 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Switch Business</p>
                    {businesses.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setBusiness(b)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${business.id === b.id ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'}`}
                      >
                        <span className="truncate">{b.name}</span>
                        {business.id === b.id && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                      </button>
                    ))}
                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />
                    <button 
                      onClick={() => {
                        setBusiness(null);
                        setCurrentPage('business-settings');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-500/5 rounded-xl transition-all"
                    >
                      <Plus size={16} />
                      Add New Business
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button className="relative p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full"></span>
              )}
            </button>
            <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold border border-zinc-300 dark:border-zinc-700">
              {user?.name[0]}
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {currentPage === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-6"
            >
              {!business ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 text-center">
                  <Briefcase className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2 text-zinc-900 dark:text-white">Setup Your Business</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 mb-6">Tell us about your business to start finding leads.</p>
                  <button 
                    onClick={() => setCurrentPage('business-settings')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold transition-all"
                  >
                    Setup Now
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { label: 'Total Leads', value: leads.length, icon: Users, color: 'text-blue-500 dark:text-blue-400' },
                      { label: 'Messages Sent', value: leads.filter(l => l.status === 'Contacted').length, icon: Send, color: 'text-emerald-500 dark:text-emerald-400' },
                      { label: 'Conversions', value: leads.filter(l => l.status === 'Converted').length, icon: CheckCircle2, color: 'text-purple-500 dark:text-purple-400' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className={`p-3 bg-zinc-100 dark:bg-zinc-950 rounded-2xl ${stat.color}`}>
                            <stat.icon size={24} />
                          </div>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">+12%</span>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{stat.label}</p>
                        <h3 className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">{stat.value}</h3>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Recent Leads</h3>
                        <button onClick={() => setCurrentPage('lead-finder')} className="text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:underline">View All</button>
                      </div>
                      <div className="space-y-4">
                        {leads.slice(0, 5).map((lead) => (
                          <div 
                            key={lead.id} 
                            onClick={() => setSelectedLead(lead)}
                            className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 cursor-pointer hover:border-emerald-500/30 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                                {lead.name[0]}
                              </div>
                              <div>
                                <p className="font-bold text-sm text-zinc-900 dark:text-white">{lead.name}</p>
                                <p className="text-xs text-zinc-500">{lead.serviceNeeded}</p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                              lead.status === 'New' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 
                              lead.status === 'Contacted' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' : 
                              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {lead.status}
                            </span>
                          </div>
                        ))}
                        {leads.length === 0 && <p className="text-zinc-500 text-center py-8">No leads found yet.</p>}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                      <h3 className="text-lg font-bold mb-6 text-zinc-900 dark:text-white">Quick Actions</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => setCurrentPage('lead-finder')}
                          className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-3xl hover:border-emerald-500/50 transition-all group"
                        >
                          <Search className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 mb-3" size={32} />
                          <span className="font-bold text-sm text-zinc-700 dark:text-zinc-300">Find Leads</span>
                        </button>
                        <button 
                          onClick={() => setCurrentPage('outreach')}
                          className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-3xl hover:border-emerald-500/50 transition-all group"
                        >
                          <Send className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 mb-3" size={32} />
                          <span className="font-bold text-sm text-zinc-700 dark:text-zinc-300">Outreach</span>
                        </button>
                        <button 
                          onClick={() => setCurrentPage('business-settings')}
                          className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-3xl hover:border-emerald-500/50 transition-all group"
                        >
                          <Briefcase className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 mb-3" size={32} />
                          <span className="font-bold text-sm text-zinc-700 dark:text-zinc-300">Business</span>
                        </button>
                        <button 
                          onClick={() => setCurrentPage('account-settings')}
                          className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-3xl hover:border-emerald-500/50 transition-all group"
                        >
                          <Settings className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 mb-3" size={32} />
                          <span className="font-bold text-sm text-zinc-700 dark:text-zinc-300">Account</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {currentPage === 'lead-finder' && (
            <motion.div
              key="lead-finder"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <LeadFinderView 
                business={business} 
                userPlan={user?.plan || 'Free'}
                currentLeadCount={leads.length}
                onLeadsFound={(newLeads) => {
                  setLeads(prev => [...newLeads, ...prev]);
                  addNotification(`Found ${newLeads.length} new leads!`);
                }} 
              />
            </motion.div>
          )}

          {currentPage === 'outreach' && (
            <motion.div
              key="outreach"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <OutreachView 
                leads={leads} 
                business={business} 
                onUpdateLead={(updatedLead) => {
                  firebaseDb.updateLead(updatedLead);
                }} 
                onSelectLead={setSelectedLead}
              />
            </motion.div>
          )}

          {currentPage === 'campaigns' && (
            <motion.div
              key="campaigns"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <CampaignsView 
                campaigns={campaigns} 
                business={business} 
                userPlan={user?.plan || 'Free'}
                onCampaignGenerated={(newCampaign) => {
                  firebaseDb.saveCampaign(newCampaign);
                }} 
                onUpdateCampaign={(updated) => {
                  firebaseDb.updateCampaign(updated);
                }}
              />
            </motion.div>
          )}

          {currentPage === 'business-settings' && (
            <motion.div
              key="business-settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <BusinessSettingsView user={user} business={business} onSaveBusiness={(b) => {
                setBusiness(b);
                setBusinesses(prev => {
                  const exists = prev.find(p => p.id === b.id);
                  if (exists) return prev.map(p => p.id === b.id ? b : p);
                  return [...prev, b];
                });
                firebaseDb.saveBusiness(b);
              }} />
            </motion.div>
          )}

          {currentPage === 'account-settings' && (
            <motion.div
              key="account-settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <AccountSettingsView user={user} onUpdateUser={(u) => setUser(u)} />
            </motion.div>
          )}
        </AnimatePresence>

        <LeadModal 
          lead={selectedLead} 
          onClose={() => setSelectedLead(null)} 
          onUpdateStatus={(status) => {
            if (selectedLead) {
              const updated = { ...selectedLead, status };
              firebaseDb.updateLead(updated);
              setSelectedLead(updated);
            }
          }}
        />

        <SupportChat />
      </main>
    </div>
  );
}

function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([
    { role: 'model', text: "Hi! I'm your LeadFlow AI Assistant. How can I help you grow your business today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...messages, { role: 'user', text: userMsg }].map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: `You are the LeadFlow AI Support Agent. You have complete knowledge of the app.
          App Name: LeadFlow AI
          Core Purpose: One-click customer growth for small businesses (barbers, salons, laundry, hotels).
          
          Features:
          1. Dashboard: Overview of leads, messages sent, and conversions.
          2. AI Lead Finder: Scans social media/forums to find people needing services.
          3. Customer Outreach: Generates personalized AI messages for leads.
          4. Marketing Campaigns: Creates multi-platform (IG, LinkedIn, Twitter) marketing content.
          5. Business Settings: Configure business name, type, and location.
          6. Account Settings: Manage profile and subscription.
          
          Subscription Plans & Limits:
          - Free: 10 Leads, 1 Campaign.
          - Basic ($19): 50 Leads, 5 Campaigns.
          - Growth ($49): 200 Leads, 20 Campaigns.
          - Premium ($99): Unlimited leads and campaigns.
          
          Tone: Helpful, professional, concise, and encouraging.
          If asked about technical issues, suggest checking the internet connection or refreshing.
          If asked about payments, mention that we use Stripe for secure transactions.`,
        }
      });

      const aiText = response.text || "I'm sorry, I couldn't process that. Please try again.";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting right now. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-20 right-0 w-80 md:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[500px]"
          >
            {/* Header */}
            <div className="p-4 bg-emerald-500 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Bot size={20} />
                <span className="font-bold">AI Support</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-zinc-50 dark:bg-zinc-950">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    m.role === 'user' 
                      ? 'bg-emerald-500 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-tl-none shadow-sm'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-zinc-800 p-3 rounded-2xl rounded-tl-none border border-zinc-200 dark:border-zinc-700 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
              <div className="relative">
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything..."
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${
          isOpen ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900' : 'bg-emerald-500 text-white hover:bg-emerald-600'
        }`}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}

function LeadFinderView({ business, userPlan, currentLeadCount, onLeadsFound }: { business: Business | null, userPlan: User['plan'], currentLeadCount: number, onLeadsFound: (leads: Lead[]) => void }) {
  const [isFinding, setIsFinding] = useState(false);
  const limit = PLAN_LIMITS[userPlan].leads;
  const isLimitReached = currentLeadCount >= limit;

  const handleFindLeads = async () => {
    if (!business || isLimitReached) return;
    setIsFinding(true);
    try {
      const results = await findLeads(business.type, business.location);
      const newLeads: Lead[] = results.map((r: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: r.name,
        contact: r.contact,
        serviceNeeded: r.serviceNeeded,
        businessId: business.id,
        ownerId: business.ownerId,
        status: 'New'
      }));
      firebaseDb.saveLeads(newLeads);
      onLeadsFound(newLeads);
    } catch (error) {
      console.error(error);
      alert('Error finding leads');
    } finally {
      setIsFinding(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 text-center shadow-sm">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles className="text-emerald-600 dark:text-emerald-500 w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">Find Your Next Customers</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-4 max-w-md mx-auto">Our AI scans social media and local forums to find people looking for your services right now.</p>
        
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 text-sm font-medium mb-2">
            <span className={isLimitReached ? 'text-red-500' : 'text-zinc-500'}>
              {currentLeadCount} / {limit} Leads Used
            </span>
            {isLimitReached && (
              <span className="text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20">
                LIMIT REACHED
              </span>
            )}
          </div>
          <div className="w-full max-w-xs mx-auto bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${isLimitReached ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min((currentLeadCount / limit) * 100, 100)}%` }}
            />
          </div>
        </div>

        {isLimitReached ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">You've reached your plan's lead limit. Upgrade to find more customers.</p>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('changePage', { detail: 'account-settings' }))}
              className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-4 px-8 rounded-2xl transition-all"
            >
              Upgrade Plan
            </button>
          </div>
        ) : (
          <button 
            onClick={handleFindLeads}
            disabled={isFinding || !business}
            className={`bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-3 mx-auto ${isFinding ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isFinding ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Scanning Social Media...
              </>
            ) : (
              <>
                <Search size={20} />
                Find Leads Now
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function OutreachView({ leads, business, onUpdateLead, onSelectLead }: { leads: Lead[], business: Business | null, onUpdateLead: (lead: Lead) => void, onSelectLead: (lead: Lead) => void }) {
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const handleGenerateOutreach = async (lead: Lead) => {
    if (!business) return;
    setGeneratingFor(lead.id);
    try {
      const message = await generateOutreach(lead.name, business.name, lead.serviceNeeded);
      onUpdateLead({ ...lead, outreachMessage: message, status: 'Contacted' });
    } catch (error) {
      console.error(error);
      alert('Error generating outreach');
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 gap-4">
        {leads.map((lead) => (
          <div 
            key={lead.id} 
            onClick={() => onSelectLead(lead)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm cursor-pointer hover:border-emerald-500/30 transition-all"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                  {lead.name[0]}
                </div>
                <div>
                  <h4 className="font-bold text-lg text-zinc-900 dark:text-white">{lead.name}</h4>
                  <div className="flex items-center gap-2 text-zinc-500 text-sm">
                    <MessageSquare size={14} />
                    <span>{lead.contact}</span>
                    <span className="mx-1">•</span>
                    <span>{lead.serviceNeeded}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {lead.outreachMessage ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      // Logic to send message could go here
                    }}
                    className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                  >
                    <Send size={16} />
                    Send Message
                  </button>
                ) : (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateOutreach(lead);
                    }}
                    disabled={generatingFor === lead.id}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                  >
                    {generatingFor === lead.id ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    Generate AI Message
                  </button>
                )}
              </div>
            </div>
            
            {lead.outreachMessage && (
              <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed italic">"{lead.outreachMessage}"</p>
              </div>
            )}
          </div>
        ))}
        {leads.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm">
            <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">No leads to contact yet. Go to Lead Finder first!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function CampaignsView({ campaigns, business, userPlan, onCampaignGenerated, onUpdateCampaign }: { campaigns: Campaign[], business: Business | null, userPlan: User['plan'], onCampaignGenerated: (c: Campaign) => void, onUpdateCampaign: (c: Campaign) => void }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [title, setTitle] = useState('');
  const [info, setInfo] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const limit = PLAN_LIMITS[userPlan].campaigns;
  const isLimitReached = campaigns.length >= limit;

  const handleGenerate = async () => {
    if (!business || !title || isLimitReached) return;
    setIsGenerating(true);
    try {
      const content = await generateCampaign(business.name, info || business.type);
      const newCampaign: Campaign = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        content,
        businessId: business.id,
        ownerId: business.ownerId,
        scheduledTime: new Date().toISOString()
      };
      onCampaignGenerated(newCampaign);
      setTitle('');
      setInfo('');
    } catch (error) {
      console.error(error);
      alert('Error generating campaign');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Create New Campaign</h3>
          <div className="text-right">
            <p className={`text-xs font-bold ${isLimitReached ? 'text-red-500' : 'text-zinc-500'}`}>
              {campaigns.length} / {limit} Campaigns
            </p>
          </div>
        </div>

        {isLimitReached ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
            <Megaphone className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm mb-4">Campaign limit reached for {userPlan} plan.</p>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('changePage', { detail: 'account-settings' }))}
              className="text-emerald-600 dark:text-emerald-400 font-bold text-sm hover:underline"
            >
              Upgrade to create more campaigns
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Campaign Title (e.g., Summer Special)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <textarea 
              placeholder="Additional business info or promotion details..."
              value={info}
              onChange={(e) => setInfo(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors h-24"
            />
            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !title}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles size={20} />
              )}
              Generate AI Campaign
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Your Campaigns</h3>
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-xl font-bold text-zinc-900 dark:text-white">{campaign.title}</h4>
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Clock size={12} />
                  {new Date(campaign.scheduledTime).toLocaleDateString()}
                </span>
              </div>
              <button 
                onClick={() => setSelectedCampaign(campaign)}
                className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
              >
                <BarChart3 size={16} />
                Track Performance
              </button>
            </div>

            {campaign.metrics && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-center">
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase mb-1">Reach</p>
                  <p className="text-xl font-bold text-zinc-900 dark:text-white">{campaign.metrics.reach.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-center">
                  <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Clicks</p>
                  <p className="text-xl font-bold text-zinc-900 dark:text-white">{campaign.metrics.clicks.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl text-center">
                  <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Engagement</p>
                  <p className="text-xl font-bold text-zinc-900 dark:text-white">{campaign.metrics.engagement}%</p>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaign.content.posts?.map((post: any, i: number) => (
                <div key={i} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-emerald-500/10 rounded flex items-center justify-center text-emerald-600 dark:text-emerald-500 text-[10px] font-bold">
                      {post.platform[0]}
                    </div>
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{post.platform}</span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 line-clamp-3">{post.caption}</p>
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Image Idea</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{post.imageIdea}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <CampaignMetricsModal 
        campaign={selectedCampaign} 
        onClose={() => setSelectedCampaign(null)} 
        onUpdateMetrics={(metrics) => {
          if (selectedCampaign) {
            onUpdateCampaign({ ...selectedCampaign, metrics });
            setSelectedCampaign(null);
          }
        }}
      />
    </motion.div>
  );
}

function CampaignMetricsModal({ campaign, onClose, onUpdateMetrics }: { campaign: Campaign | null, onClose: () => void, onUpdateMetrics: (metrics: Campaign['metrics']) => void }) {
  const [clicks, setClicks] = useState(campaign?.metrics?.clicks || 0);
  const [engagement, setEngagement] = useState(campaign?.metrics?.engagement || 0);
  const [reach, setReach] = useState(campaign?.metrics?.reach || 0);

  useEffect(() => {
    if (campaign) {
      setClicks(campaign.metrics?.clicks || 0);
      setEngagement(campaign.metrics?.engagement || 0);
      setReach(campaign.metrics?.reach || 0);
    }
  }, [campaign]);

  if (!campaign) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
        >
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Track Performance</h2>
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-zinc-500 text-sm mb-6">Manually enter the metrics from your social media platforms to track this campaign's success.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Total Reach</label>
                <input 
                  type="number" 
                  value={reach}
                  onChange={(e) => setReach(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Total Clicks</label>
                <input 
                  type="number" 
                  value={clicks}
                  onChange={(e) => setClicks(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Engagement Rate (%)</label>
                <input 
                  type="number" 
                  value={engagement}
                  onChange={(e) => setEngagement(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <button 
                onClick={() => onUpdateMetrics({ clicks, engagement, reach })}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
              >
                Save Metrics
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function LeadModal({ lead, onClose, onUpdateStatus }: { lead: Lead | null, onClose: () => void, onUpdateStatus: (status: Lead['status']) => void }) {
  if (!lead) return null;

  return (
    <AnimatePresence>
      {lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-500 text-xl font-bold">
                    {lead.name[0]}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{lead.name}</h2>
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">Lead Details</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Contact Info</p>
                    <p className="text-zinc-900 dark:text-white font-medium">{lead.contact}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Service Needed</p>
                    <p className="text-zinc-900 dark:text-white font-medium">{lead.serviceNeeded}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Current Status</p>
                  <div className="flex flex-wrap gap-2">
                    {(['New', 'Contacted', 'Converted'] as Lead['status'][]).map((status) => (
                      <button
                        key={status}
                        onClick={() => onUpdateStatus(status)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          lead.status === status 
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {lead.outreachMessage && (
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">AI Outreach Message</p>
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                      <p className="text-zinc-700 dark:text-zinc-300 italic text-sm leading-relaxed">
                        "{lead.outreachMessage}"
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={onClose}
                  className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-4 rounded-2xl transition-all hover:opacity-90"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function BusinessSettingsView({ user, business, onSaveBusiness }: { user: User | null, business: Business | null, onSaveBusiness: (b: Business) => void }) {
  const [name, setName] = useState(business?.name || '');
  const [type, setType] = useState<Business['type']>(business?.type || 'barber');
  const [location, setLocation] = useState(business?.location || '');

  const handleSave = () => {
    if (!user) return;
    const newBusiness: Business = {
      id: business?.id || Math.random().toString(36).substr(2, 9),
      name,
      type,
      location,
      ownerId: user.id
    };
    onSaveBusiness(newBusiness);
    alert('Business settings saved!');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-zinc-900 dark:text-white">Business Profile</h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Business Name</label>
            <div className="relative">
              <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={20} />
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="My Awesome Shop"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Business Type</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['barber', 'salon', 'laundry', 'hotel'].map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t as any)}
                  className={`px-4 py-3 rounded-xl text-sm font-bold capitalize transition-all border ${type === t ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Location</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={20} />
              <input 
                type="text" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Lagos, Nigeria"
              />
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AccountSettingsView({ user, onUpdateUser }: { user: User | null, onUpdateUser: (u: User) => void }) {
  const [name, setName] = useState(user?.name || '');
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    const updatedUser = { ...user, name };
    await firebaseDb.saveUser(updatedUser);
    onUpdateUser(updatedUser);
    alert('Profile updated!');
  };

  const handleUpgrade = async (plan: User['plan']) => {
    if (!user) return;
    setIsUpgrading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId: user.id }),
      });
      const { url } = await response.json();
      if (url) window.location.href = url;
    } catch (error) {
      console.error(error);
      alert('Payment failed to initialize');
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-zinc-900 dark:text-white">Profile Information</h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Email Address</label>
            <input 
              type="email" 
              value={user?.email}
              disabled
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-zinc-500 cursor-not-allowed"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Email cannot be changed as it is linked to your Google account.</p>
          </div>
          <button 
            onClick={handleSaveProfile}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
          >
            Update Profile
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-zinc-900 dark:text-white">Subscription Plan</h3>
        <div className="space-y-4">
          <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">{user?.plan} Plan</p>
                {user?.paymentStatus && (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 size={10} />
                    VERIFIED
                  </span>
                )}
              </div>
              <p className="text-zinc-500 text-sm">
                {user?.plan === 'Free' ? 'Unlock more leads and campaigns' : 'Next billing date: April 16, 2026'}
              </p>
            </div>
            {user?.plan === 'Free' && (
              <span className="text-xs bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-1 rounded-md">Current</span>
            )}
          </div>

          {user?.plan === 'Free' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              {[
                { name: 'Basic', price: '$19', features: ['50 Leads/mo', 'Basic AI'] },
                { name: 'Growth', price: '$49', features: ['200 Leads/mo', 'Advanced AI'] },
                { name: 'Premium', price: '$99', features: ['Unlimited', 'Priority Support'] },
              ].map((p) => (
                <div key={p.name} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col shadow-sm">
                  <p className="font-bold text-zinc-900 dark:text-white">{p.name}</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 my-2">{p.price}</p>
                  <ul className="text-xs text-zinc-500 space-y-1 mb-4 flex-grow">
                    {p.features.map(f => <li key={f}>• {f}</li>)}
                  </ul>
                  <button 
                    onClick={() => handleUpgrade(p.name as any)}
                    disabled={isUpgrading}
                    className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500 hover:text-white text-zinc-900 dark:text-white text-xs font-bold py-2 rounded-lg transition-all"
                  >
                    {isUpgrading ? '...' : 'Upgrade'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-zinc-900 dark:text-white">Payment Details</h3>
        <div className="p-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
          <p className="text-zinc-500 text-sm mb-4">No payment method on file.</p>
          <button className="text-emerald-600 dark:text-emerald-400 font-bold text-sm hover:underline">
            Add Payment Method
          </button>
        </div>
      </div>
    </motion.div>
  );
}
