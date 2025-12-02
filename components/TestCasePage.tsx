
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon } from '../constants';
import Footer from './Footer';

// Define the structure for test cases
type TestStatus = 'pending' | 'pass' | 'fail' | 'skip';
type Priority = 'high' | 'medium' | 'low';
interface TestCase {
  id: string;
  category: string;
  description: string;
  priority: Priority;
}
type TestStatuses = Record<string, TestStatus>;

const LOCAL_STORAGE_KEY = 'font-creator-test-statuses';

interface TestCasePageProps {
  onClose: () => void;
}

// Accordion component for grouping tests
const Accordion: React.FC<{ title: string; children: React.ReactNode; initialOpen?: boolean; passPercentage: number | null }> = ({ title, children, initialOpen = false, passPercentage }) => {
    const { t } = useLocale();
    const [isOpen, setIsOpen] = useState(initialOpen);
    return (
        <div className="border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 font-semibold text-lg text-left bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">
                <div className="flex items-center gap-4">
                    <span>{title}</span>
                    {passPercentage !== null && (
                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${passPercentage >= 80 ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200'}`}>
                            {t('passPercentage', { percentage: passPercentage.toFixed(0) })}
                        </span>
                    )}
                </div>
                <svg className={`w-5 h-5 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isOpen && <div className="p-4">{children}</div>}
        </div>
    );
};

const PriorityIndicator: React.FC<{ priority: Priority }> = ({ priority }) => {
    const { t } = useLocale();
    const priorityClasses = {
        high: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
        medium: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
        low: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
    };
    const priorityTextMap = {
        high: t('priorityHigh'),
        medium: t('priorityMedium'),
        low: t('priorityLow'),
    };
    return (
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${priorityClasses[priority]}`}>
            {priorityTextMap[priority]}
        </span>
    );
};

type FilterType = 'all' | Priority;

const TestCasePage: React.FC<TestCasePageProps> = ({ onClose }) => {
  const { t } = useLocale();
  const [statuses, setStatuses] = useState<TestStatuses>({});
  const [allTestCases, setAllTestCases] = useState<TestCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  // Load test cases from JSON file
  useEffect(() => {
    fetch('/data/test_cases.json')
        .then(res => res.json())
        .then((data: TestCase[]) => {
            setAllTestCases(data);
            setIsLoading(false);
        })
        .catch(err => {
            console.error("Failed to load test cases:", err);
            setIsLoading(false);
        });
  }, []);

  // Load statuses from local storage on mount
  useEffect(() => {
    try {
      const savedStatuses = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedStatuses) {
        setStatuses(JSON.parse(savedStatuses));
      }
    } catch (e) {
      console.error("Failed to load test statuses from local storage", e);
    }
  }, []);

  // Save statuses to local storage on change
  const handleSetStatus = useCallback((id: string, status: TestStatus) => {
    setStatuses(prev => {
        const newStatuses = { ...prev, [id]: status };
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newStatuses));
        } catch (e) {
            console.error("Failed to save test statuses to local storage", e);
        }
        return newStatuses;
    });
  }, []);
  
  const resetStatuses = () => {
      setStatuses({});
      localStorage.removeItem(LOCAL_STORAGE_KEY);
  };
  
  const filteredCases = useMemo(() => {
    if (filter === 'all') return allTestCases;
    return allTestCases.filter(c => c.priority === filter);
  }, [allTestCases, filter]);

  const groupedCases = useMemo(() => filteredCases.reduce((acc, testCase) => {
    if (!acc[testCase.category]) {
      acc[testCase.category] = [];
    }
    acc[testCase.category].push(testCase);
    return acc;
  }, {} as Record<string, TestCase[]>), [filteredCases]);
  
  const stats = useMemo(() => {
    const total = allTestCases.length;
    if (total === 0) return { total: 0, passed: 0, failed: 0, skipped: 0, untested: 0 };
    
    const passed = Object.values(statuses).filter(s => s === 'pass').length;
    const failed = Object.values(statuses).filter(s => s === 'fail').length;
    const skipped = Object.values(statuses).filter(s => s === 'skip').length;
    const untested = total - passed - failed - skipped;
    
    return { total, passed, failed, skipped, untested };
  }, [allTestCases, statuses]);

  const getStatusClasses = (status: TestStatus | undefined) => {
    switch(status) {
        case 'pass': return 'bg-green-100 dark:bg-green-900/50 border-green-500';
        case 'fail': return 'bg-red-100 dark:bg-red-900/50 border-red-500';
        case 'skip': return 'bg-gray-200 dark:bg-gray-700/50 border-gray-400 dark:border-gray-500';
        default: return 'bg-gray-50 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600';
    }
  };

  const FilterButton: React.FC<{ type: FilterType, label: string, colorClass: string }> = ({ type, label, colorClass }) => (
    <button
        onClick={() => setFilter(type)}
        className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${filter === type ? `${colorClass} text-white shadow` : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
    >
        {label}
    </button>
);


  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
        <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
          <BackIcon />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('testCases')}</h2>
        <button onClick={resetStatuses} className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700">{t('resetAll')}</button>
      </header>
      <main className="flex-grow overflow-y-auto p-6 md:p-10">
        <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6 text-center">
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <p className="text-3xl font-bold text-gray-800 dark:text-white">{stats.total}</p>
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('total')}</p>
                </div>
                <div className="p-4 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.passed}</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">{t('passed')}</p>
                </div>
                <div className="p-4 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.failed}</p>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t('failed')}</p>
                </div>
                <div className="p-4 bg-gray-200 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.skipped}</p>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('skipped')}</p>
                </div>
                <div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.untested}</p>
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{t('untested')}</p>
                </div>
            </div>

          <div className="p-4 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center gap-2 flex-wrap">
              <span className="font-semibold mr-2">{t('filterByPriority')}</span>
              <FilterButton type="all" label={t('filterAll')} colorClass="bg-gray-500" />
              <FilterButton type="high" label={t('filterHigh')} colorClass="bg-red-500" />
              <FilterButton type="medium" label={t('filterMedium')} colorClass="bg-yellow-500" />
              <FilterButton type="low" label={t('filterLow')} colorClass="bg-blue-500" />
          </div>

          {isLoading ? (
             <div className="text-center p-8">{t('loadingTestCases')}</div>
          ) : (
            Object.entries(groupedCases).map(([category, cases]: [string, TestCase[]], index) => {
              const categoryPassed = cases.filter(c => statuses[c.id] === 'pass').length;
              const categorySkipped = cases.filter(c => statuses[c.id] === 'skip').length;
              const totalInCategory = cases.length;
              const denominator = totalInCategory - categorySkipped;
              const passPercentage = denominator > 0 ? (categoryPassed / denominator) * 100 : null;

              return (
                <Accordion key={category} title={category} initialOpen={true} passPercentage={passPercentage}>
                    <div className="space-y-4">
                        {cases.map(testCase => (
                            <div key={testCase.id} className={`p-4 border-l-4 rounded-r-lg ${getStatusClasses(statuses[testCase.id])}`}>
                                <div className="flex justify-between items-start mb-2 gap-4">
                                    <p className="font-medium text-gray-800 dark:text-gray-200">{testCase.description}</p>
                                    <PriorityIndicator priority={testCase.priority} />
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleSetStatus(testCase.id, 'pass')} className="px-3 py-1 text-sm bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">{t('pass')}</button>
                                    <button onClick={() => handleSetStatus(testCase.id, 'fail')} className="px-3 py-1 text-sm bg-red-600 text-white font-semibold rounded-md hover:bg-red-700">{t('fail')}</button>
                                    <button onClick={() => handleSetStatus(testCase.id, 'skip')} className="px-3 py-1 text-sm bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600">{t('skip')}</button>
                                    <button onClick={() => handleSetStatus(testCase.id, 'pending')} className="px-3 py-1 text-sm bg-gray-400 text-white font-semibold rounded-md hover:bg-gray-500">{t('clear')}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Accordion>
              );
            })
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TestCasePage;
