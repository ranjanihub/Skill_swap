'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { supabase, Skill } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SkillAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<number[]>([0, 0, 0, 0, 0]);
  const [saving, setSaving] = useState(false);

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

  const getQuestionsForSkill = (name: string): QA[] => {
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

  const questions = useMemo(() => (skill ? getQuestionsForSkill(skill.name) : []), [skill]);

  useEffect(() => {
    setAnswers((prev) => {
      if (prev.length === questions.length) return prev;
      return new Array(questions.length).fill(-1);
    });
  }, [questions.length]);

  const handleAnswer = (idx: number, value: number) => {
    setAnswers((a) => {
      const copy = [...a];
      copy[idx] = value;
      return copy;
    });
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Assess: {skill.name}</h1>
        <p className="text-sm text-skillswap-600">Quick self-assessment — answer honestly to get a recommended level.</p>
      </div>

      <Card className="p-6 space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="space-y-2">
            <div>
              <p className="text-sm text-skillswap-dark">{q.question}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.options.map((opt, oi) => (
                <label key={oi} className="flex items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name={`q-${i}`}
                    checked={answers[i] === oi}
                    onChange={() => handleAnswer(i, oi)}
                    className="w-4 h-4"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            <hr className="my-2" />
          </div>
        ))}

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
