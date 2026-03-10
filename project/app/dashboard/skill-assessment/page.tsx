'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { supabase, Skill } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SECONDS_PER_QUESTION = 10;

type Phase = 'instructions' | 'quiz' | 'results';

export default function SkillAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // New state for phased quiz flow
  const [phase, setPhase] = useState<Phase>('instructions');
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    // read skillId from query string
    const params = new URLSearchParams(window.location.search);
    const skillId = params.get('skillId');
    const run = async () => {
      if (!skillId) {
        setError('No skill specified (skillId query param required)');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data, error } = await supabase.from('skills').select('*').eq('id', skillId).maybeSingle();
        if (error) throw error;
        setSkill((data || null) as Skill | null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [authLoading]);

  type QA = { question: string; options: string[]; correctIndex: number };

  // legacy fallback if AI generation fails
  const getStaticQuestionsForSkill = (name: string): QA[] => {
    const s = name.toLowerCase();

    if (/\b(py|python)\b/.test(s)) {
      return [
        {
          question: 'Which of the following is a valid way to create a list in Python?',
          options: ['list = (1,2,3)', 'list = [1,2,3]', 'list = {1,2,3}', 'list = <1,2,3>'],
          correctIndex: 1,
        },
        {
          question: 'What does `len()` do in Python?',
          options: ['Return the length of an object', 'Create a new list', 'Convert to integer', 'Delete an object'],
          correctIndex: 0,
        },
        {
          question: 'Which keyword defines a function in Python?',
          options: ['func', 'def', 'function', 'fn'],
          correctIndex: 1,
        },
        {
          question: 'How do you write a comment in Python?',
          options: ['// comment', '<!-- comment -->', '# comment', '/* comment */'],
          correctIndex: 2,
        },
        {
          question: 'Which data type is immutable in Python?',
          options: ['list', 'dict', 'set', 'tuple'],
          correctIndex: 3,
        },
      ];
    }

    if (/\b(js|javascript)\b/.test(s)) {
      return [
        {
          question: 'Which keyword declares a variable with block scope in modern JavaScript?',
          options: ['var', 'let', 'const', 'dim'],
          correctIndex: 1,
        },
        {
          question: 'How do you create an arrow function?',
          options: ['function() => {}', '() => {}', '=> function() {}', 'fn => {}'],
          correctIndex: 1,
        },
        {
          question: 'Which method converts a JSON string to an object?',
          options: ['JSON.stringify', 'JSON.parse', 'JSON.toObject', 'parse.JSON'],
          correctIndex: 1,
        },
        {
          question: 'What is the result of `[] + []` in JavaScript?',
          options: ['[]', '""', '0', 'NaN'],
          correctIndex: 1,
        },
        {
          question: 'Which of these is a primitive type in JS?',
          options: ['Object', 'Array', 'Symbol', 'Date'],
          correctIndex: 2,
        },
      ];
    }

    if (/\b(sql)\b/.test(s)) {
      return [
        {
          question: 'Which SQL clause is used to filter rows?',
          options: ['GROUP BY', 'ORDER BY', 'WHERE', 'HAVING'],
          correctIndex: 2,
        },
        {
          question: 'Which statement removes a table and its data?',
          options: ['DELETE TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'REMOVE TABLE'],
          correctIndex: 1,
        },
        {
          question: 'Which function counts rows in SQL?',
          options: ['COUNT(*)', 'SUM()', 'TOTAL()', 'NUMBER()'],
          correctIndex: 0,
        },
        {
          question: 'How do you get unique values from a column?',
          options: ['SELECT UNIQUE', 'SELECT DISTINCT', 'SELECT ONLY', 'SELECT SINGLE'],
          correctIndex: 1,
        },
        {
          question: 'Which clause groups rows that have the same values?',
          options: ['GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT'],
          correctIndex: 0,
        },
      ];
    }

    // Generic scenario-based multiple-choice questions for non-technical skills
    return [
      {
        question: `You are asked to demonstrate ${name} to a newcomer. What is the best first step?`,
        options: ['Give them an advanced exercise', 'Explain high-level concepts and motivations', 'Have them read a long spec', 'Ignore their questions'],
        correctIndex: 1,
      },
      {
        question: `When facing a common problem in ${name}, the best approach is:`,
        options: ['Panic and ask for help', 'Try well-known solutions and debug systematically', 'Rebuild everything from scratch', 'Blame external tools'],
        correctIndex: 1,
      },
      {
        question: `How would you measure improvement in ${name}?`,
        options: ['Track concrete outcomes or completed tasks', 'Rely on subjective feeling only', 'Change goals daily', 'Avoid measuring'],
        correctIndex: 0,
      },
      {
        question: `If asked to teach ${name} to a peer, you should:`,
        options: ['Skip fundamentals and show advanced tricks', 'Start with fundamentals then practical examples', 'Only share slides', 'Only give long reading lists'],
        correctIndex: 1,
      },
      {
        question: `Which behaviour indicates a strong practical ability in ${name}?`,
        options: ['Knowing many buzzwords', 'Applying concepts to solve real problems', 'Reading documentation once', 'Avoiding hands-on tasks'],
        correctIndex: 1,
      },
    ];
  };

  const [questionsState, setQuestionsState] = useState<QA[]>([]);
  const questions = useMemo(() => questionsState, [questionsState]);

  useEffect(() => {
    if (!skill) return;
    const fetchQs = async () => {
      try {
        const res = await fetch(`/api/generate-questions?skill=${encodeURIComponent(skill.name)}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setQuestionsState(data as QA[]);
        } else {
          setQuestionsState(getStaticQuestionsForSkill(skill.name));
        }
      } catch (e) {
        console.error('AI question fetch failed', e);
        setQuestionsState(getStaticQuestionsForSkill(skill.name));
      }
    };
    setQuestionsState([]);
    void fetchQs();
  }, [skill]);

  useEffect(() => {
    setAnswers((prev) => {
      if (prev.length === questionsState.length) return prev;
      return new Array(questionsState.length).fill(-1);
    });
  }, [questionsState.length]);

  // --- Timer logic ---
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goToNextQuestion = useCallback(() => {
    clearTimer();
    if (currentQ < questions.length - 1) {
      setCurrentQ((c) => c + 1);
      setTimeLeft(SECONDS_PER_QUESTION);
    } else {
      // last question — show results
      setPhase('results');
    }
  }, [clearTimer, currentQ, questions.length]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    clearTimer();
    setTimeLeft(SECONDS_PER_QUESTION);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          // time's up — auto advance
          goToNextQuestion();
          return SECONDS_PER_QUESTION;
        }
        return t - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase, currentQ, clearTimer, goToNextQuestion]);

  const handleAnswer = (qIdx: number, optIdx: number) => {
    setAnswers((a) => {
      const copy = [...a];
      copy[qIdx] = optIdx;
      return copy;
    });
    // auto-advance after selecting an answer
    setTimeout(() => goToNextQuestion(), 400);
  };

  const startQuiz = () => {
    setCurrentQ(0);
    setTimeLeft(SECONDS_PER_QUESTION);
    setPhase('quiz');
  };

  const score = useMemo(() => {
    if (questions.length === 0) return 0;
    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
      if (answers[i] === questions[i].correctIndex) correct += 1;
    }
    return Math.round((correct / questions.length) * 100);
  }, [answers, questions.length, questions]);

  const level = useMemo(() => {
    if (score >= 80) return 'advanced';
    if (score >= 45) return 'intermediate';
    return 'beginner';
  }, [score]);

  const saveAssessmentToSkill = async () => {
    if (!skill || !user) return;
    try {
      setSaving(true);
      setError(null);
      const correct = questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0);
      const summary = `Assessment: ${score}% (${correct}/${questions.length}) — ${level}. Answers: ${answers.join(', ')}`;
      const { error } = await supabase
        .from('skills')
        .update({ description: summary })
        .eq('id', skill.id)
        .eq('user_id', user.id);
      if (error) throw error;
      // reflect locally
      setSkill((s) => (s ? { ...s, description: summary } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="min-h-[40vh] flex items-center justify-center">Loading...</div>;
  if (error) return <Card className="p-6 bg-destructive/10 border-destructive/20"><p className="text-destructive">{error}</p></Card>;
  if (!skill) return <Card className="p-6"><p>Skill not found.</p></Card>;
  if (!skill || questionsState.length === 0) return <div className="min-h-[40vh] flex items-center justify-center"><div className="w-10 h-10 border-4 border-skillswap-200 border-t-skillswap-500 rounded-full animate-spin" /><p className="ml-4">Generating questions…</p></div>;

  // --- INSTRUCTIONS PHASE ---
  if (phase === 'instructions') {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Skill Assessment: {skill.name}</h1>
        </div>

        <Card className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-skillswap-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-skillswap-600"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <h2 className="text-xl font-semibold">Instructions</h2>
          </div>

          <div className="space-y-3 text-sm text-skillswap-700">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-skillswap-50">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-skillswap-200 text-skillswap-800 flex items-center justify-center text-xs font-bold">1</span>
              <p>This assessment contains <strong>{questions.length} questions</strong> about <strong>{skill.name}</strong>.</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-skillswap-50">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-skillswap-200 text-skillswap-800 flex items-center justify-center text-xs font-bold">2</span>
              <p>Each question will be displayed for <strong>{SECONDS_PER_QUESTION} seconds</strong>. A countdown timer will be shown.</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-skillswap-50">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-skillswap-200 text-skillswap-800 flex items-center justify-center text-xs font-bold">3</span>
              <p>Select your answer by clicking on one of the options. The quiz will <strong>auto-advance</strong> after you answer or when time runs out.</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-skillswap-50">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-skillswap-200 text-skillswap-800 flex items-center justify-center text-xs font-bold">4</span>
              <p>If you don&apos;t answer within the time limit, the question will be marked as <strong>unanswered</strong>.</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-skillswap-50">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-skillswap-200 text-skillswap-800 flex items-center justify-center text-xs font-bold">5</span>
              <p>Your results will be shown at the end. You can save the assessment to your skill profile.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 flex-shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <p className="text-sm text-amber-800">Once you start, you cannot pause or go back to a previous question. Make sure you are ready!</p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-skillswap-500">Total time: ~{questions.length * SECONDS_PER_QUESTION} seconds</p>
            <Button onClick={startQuiz} className="bg-skillswap-500 hover:bg-skillswap-600 text-white px-8">
              Start Assessment
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- QUIZ PHASE (one question at a time) ---
  if (phase === 'quiz') {
    const q = questions[currentQ];
    const progress = ((currentQ) / questions.length) * 100;
    const timerPercent = (timeLeft / SECONDS_PER_QUESTION) * 100;

    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Assess: {skill.name}</h1>
          <span className="text-sm text-skillswap-600 font-medium">
            Question {currentQ + 1} of {questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-skillswap-100 rounded-full h-2">
          <div
            className="bg-skillswap-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <Card className="p-6 space-y-6">
          {/* Timer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={timeLeft <= 3 ? 'text-red-500' : 'text-skillswap-500'}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span className={`text-lg font-bold tabular-nums ${timeLeft <= 3 ? 'text-red-500' : 'text-skillswap-700'}`}>
                {timeLeft}s
              </span>
            </div>
            <span className="text-xs text-skillswap-400">Time remaining</span>
          </div>
          {/* Timer progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-1000 linear ${timeLeft <= 3 ? 'bg-red-400' : 'bg-skillswap-400'}`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>

          {/* Question */}
          <div className="pt-2">
            <p className="text-lg font-medium text-skillswap-dark">{q.question}</p>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 gap-3">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => handleAnswer(currentQ, oi)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all text-sm font-medium ${
                  answers[currentQ] === oi
                    ? 'border-skillswap-500 bg-skillswap-50 text-skillswap-800'
                    : 'border-gray-200 hover:border-skillswap-300 hover:bg-skillswap-50/50 text-skillswap-700'
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    answers[currentQ] === oi
                      ? 'bg-skillswap-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {String.fromCharCode(65 + oi)}
                  </span>
                  {opt}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // --- RESULTS PHASE ---
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Assessment Results: {skill.name}</h1>
      </div>

      <Card className="p-6 space-y-6">
        {/* Score summary */}
        <div className="flex flex-col items-center gap-4 py-6">
          <div className={`w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold text-white ${
            score >= 80 ? 'bg-green-500' : score >= 45 ? 'bg-amber-500' : 'bg-red-400'
          }`}>
            {score}%
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold capitalize">{level}</p>
            <p className="text-sm text-skillswap-600">
              {questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)} of {questions.length} correct
            </p>
          </div>
        </div>

        {/* Question review */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-skillswap-700">Question Review</h3>
          {questions.map((q, i) => {
            const isCorrect = answers[i] === q.correctIndex;
            const wasUnanswered = answers[i] === -1;
            return (
              <div key={i} className={`p-3 rounded-lg border text-sm ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <p className="font-medium text-skillswap-dark">{i + 1}. {q.question}</p>
                <div className="mt-1 flex items-center gap-2">
                  {isCorrect ? (
                    <span className="text-green-700">✓ Correct</span>
                  ) : (
                    <span className="text-red-700">
                      ✗ {wasUnanswered ? 'Not answered' : `Your answer: ${q.options[answers[i]]}`} — Correct: {q.options[q.correctIndex]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t flex items-center justify-between">
          <div>
            <p className="text-sm">Score: <strong>{score}%</strong></p>
            <p className="text-sm">Suggested level: <strong className="capitalize">{level}</strong></p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={saveAssessmentToSkill} disabled={saving} className="bg-skillswap-500 text-white">{saving ? 'Saving...' : 'Save to skill'}</Button>
            <Button variant="outline" onClick={() => (window.location.href = '/dashboard/settings')}>Done</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
