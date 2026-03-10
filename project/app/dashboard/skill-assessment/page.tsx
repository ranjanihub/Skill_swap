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
  const [skillName, setSkillName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedSkillId, setSavedSkillId] = useState<string | null>(null);

  // New state for phased quiz flow
  const [phase, setPhase] = useState<Phase>('instructions');
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get('skillName');
    if (!name) {
      setError('No skill specified (skillName query param required)');
    } else {
      setSkillName(name);
    }
    setLoading(false);
  }, [authLoading]);

  // Shim: keep a "skill" object so the rest of the component works unchanged
  const skill = skillName ? ({ id: '', name: skillName, skill_type: 'teach', proficiency_level: 'beginner' } as unknown as Skill) : null;

  type QA = { question: string; options: string[]; correctIndex: number };

  // Curated 10-question sets per skill
  const getStaticQuestionsForSkill = (name: string): QA[] => {
    const s = name.toLowerCase().trim();

    if (s === 'sql') return [
      { question: 'Which SQL clause filters rows based on a condition?', options: ['GROUP BY','ORDER BY','WHERE','HAVING'], correctIndex: 2 },
      { question: 'Which statement removes a table and all its data permanently?', options: ['DELETE TABLE','DROP TABLE','TRUNCATE TABLE','REMOVE TABLE'], correctIndex: 1 },
      { question: 'Which aggregate function counts the number of rows?', options: ['COUNT(*)','SUM()','TOTAL()','NUMBER()'], correctIndex: 0 },
      { question: 'How do you retrieve unique values from a column?', options: ['SELECT UNIQUE col','SELECT DISTINCT col','SELECT ONLY col','SELECT SINGLE col'], correctIndex: 1 },
      { question: 'Which clause groups rows with the same values?', options: ['GROUP BY','ORDER BY','HAVING','LIMIT'], correctIndex: 0 },
      { question: 'Which JOIN returns all rows from both tables, with NULLs where there is no match?', options: ['INNER JOIN','LEFT JOIN','RIGHT JOIN','FULL OUTER JOIN'], correctIndex: 3 },
      { question: 'What does the HAVING clause filter?', options: ['Individual rows before grouping','Groups after GROUP BY','Columns in SELECT','Ordered results'], correctIndex: 1 },
      { question: 'Which keyword is used to sort results in descending order?', options: ['ASC','DESC','ORDER','SORT DESC'], correctIndex: 1 },
      { question: 'What is a PRIMARY KEY?', options: ['A column that can have duplicate values','A unique identifier for each row','A foreign reference to another table','An indexed column only'], correctIndex: 1 },
      { question: 'Which SQL statement is used to modify existing records?', options: ['INSERT','UPDATE','ALTER','MODIFY'], correctIndex: 1 },
    ];

    if (s === 'python') return [
      { question: 'Which of the following creates a list in Python?', options: ['x = (1,2,3)','x = [1,2,3]','x = {1,2,3}','x = <1,2,3>'], correctIndex: 1 },
      { question: 'What does `len()` return?', options: ['Length of an object','A new list','An integer conversion','Nothing'], correctIndex: 0 },
      { question: 'Which keyword is used to define a function?', options: ['func','def','function','fn'], correctIndex: 1 },
      { question: 'How do you write a single-line comment in Python?', options: ['// comment','<!-- comment -->','# comment','/* comment */'], correctIndex: 2 },
      { question: 'Which data type is immutable in Python?', options: ['list','dict','set','tuple'], correctIndex: 3 },
      { question: 'What is the output of `type(3.14)` in Python?', options: ['<class \'int\'>','<class \'float\'>','<class \'double\'>','<class \'number\'>'], correctIndex: 1 },
      { question: 'Which method adds an element to the end of a list?', options: ['list.add()','list.insert()','list.append()','list.push()'], correctIndex: 2 },
      { question: 'How do you open a file for reading in Python?', options: ['open("f", "w")','open("f", "r")','read("f")','file.open("f")'], correctIndex: 1 },
      { question: 'What keyword is used for exception handling in Python?', options: ['catch','except','error','handle'], correctIndex: 1 },
      { question: 'Which built-in function converts a string to an integer?', options: ['str()','float()','int()','num()'], correctIndex: 2 },
    ];

    if (s === 'java') return [
      { question: 'Which keyword is used to create an object in Java?', options: ['create','new','make','object'], correctIndex: 1 },
      { question: 'What is the entry point of a Java program?', options: ['start()','init()','main()','run()'], correctIndex: 2 },
      { question: 'Which access modifier makes a member accessible only within its class?', options: ['public','protected','default','private'], correctIndex: 3 },
      { question: 'Which data type stores a single character in Java?', options: ['String','char','letter','Char'], correctIndex: 1 },
      { question: 'What does JVM stand for?', options: ['Java Virtual Machine','Java Variable Method','Java Verified Module','Java Value Mapper'], correctIndex: 0 },
      { question: 'Which keyword prevents a class from being subclassed?', options: ['static','abstract','final','sealed'], correctIndex: 2 },
      { question: 'How do you declare an integer array of size 5 in Java?', options: ['int arr = new int[5]','int[] arr = new int[5]','array<int> arr(5)','int arr[5]'], correctIndex: 1 },
      { question: 'Which collection allows key-value pairs in Java?', options: ['ArrayList','HashSet','HashMap','LinkedList'], correctIndex: 2 },
      { question: 'What is the default value of a boolean field in Java?', options: ['true','false','null','0'], correctIndex: 1 },
      { question: 'Which interface must be implemented to sort objects using Collections.sort()?', options: ['Sortable','Comparable','Comparator','Orderable'], correctIndex: 1 },
    ];

    if (s === 'next.js') return [
      { question: 'Which folder is used for file-based routing in Next.js 13+?', options: ['src/','pages/','app/','routes/'], correctIndex: 2 },
      { question: 'Which function fetches data at build time in the Pages Router?', options: ['getServerSideProps','getStaticProps','getInitialProps','fetchBuildData'], correctIndex: 1 },
      { question: 'What directive marks a component as a Client Component in Next.js 13+?', options: ['"use client"','"client only"','<Client>','import \'client\''], correctIndex: 0 },
      { question: 'Which file defines the root layout in the App Router?', options: ['_app.tsx','layout.tsx','root.tsx','index.tsx'], correctIndex: 1 },
      { question: 'How do you create a dynamic route segment in Next.js?', options: ['[segment]','<segment>',':segment','{segment}'], correctIndex: 0 },
      { question: 'Which Next.js component optimises images automatically?', options: ['<Img>','<OptimizedImage>','<Image>','<Picture>'], correctIndex: 2 },
      { question: 'What does `getServerSideProps` do?', options: ['Fetches data at build time','Fetches data on every request','Generates static paths','Prefetches client data'], correctIndex: 1 },
      { question: 'Which file is used to customise the 404 page in the Pages Router?', options: ['error.tsx','not-found.tsx','404.tsx','missing.tsx'], correctIndex: 2 },
      { question: 'Which Next.js API handles server-side logic in the Pages Router?', options: ['pages/server/','pages/api/','pages/handlers/','pages/routes/'], correctIndex: 1 },
      { question: 'How do you prefetch a link in Next.js?', options: ['<a prefetch>','<Link prefetch>','<Link> (automatic by default)','router.prefetch()'], correctIndex: 2 },
    ];

    if (s === 'uiux') return [
      { question: 'What does UX stand for?', options: ['User Experience','User Extension','Unified Experience','UI Extension'], correctIndex: 0 },
      { question: 'Which principle states that interface elements should look the same when they behave the same?', options: ['Proximity','Consistency','Affordance','Hierarchy'], correctIndex: 1 },
      { question: 'What is a wireframe?', options: ['A high-fidelity prototype','A low-fidelity skeletal layout','A CSS framework','A colour palette tool'], correctIndex: 1 },
      { question: 'Which tool is most commonly used for UI design and prototyping?', options: ['VS Code','Figma','Jira','Slack'], correctIndex: 1 },
      { question: 'What does A/B testing measure?', options: ['Server load','Two design variants to find which performs better','Accessibility compliance','Code quality'], correctIndex: 1 },
      { question: 'What is the purpose of a user persona?', options: ['Track bugs','Represent a fictional user based on research','Define component styles','Manage sprints'], correctIndex: 1 },
      { question: 'Which colour contrast ratio is required for WCAG AA compliance for normal text?', options: ['2:1','3:1','4.5:1','7:1'], correctIndex: 2 },
      { question: 'What is a heuristic evaluation?', options: ['User testing with real users','An expert review against usability principles','A/B testing','Heat map analysis'], correctIndex: 1 },
      { question: 'What is the purpose of whitespace in UI design?', options: ['Wasted space','Improves readability and visual hierarchy','Reduces load time','Adds colour'], correctIndex: 1 },
      { question: 'What does CTA stand for in UX?', options: ['Click Through Action','Call To Action','Content Type Attribute','Creative Text Area'], correctIndex: 1 },
    ];

    if (s === 'react') return [
      { question: 'Which hook is used to manage local state in a React functional component?', options: ['useEffect','useContext','useState','useReducer'], correctIndex: 2 },
      { question: 'What does JSX stand for?', options: ['JavaScript XML','JavaScript Extension','Java Syntax Extension','JSON XML'], correctIndex: 0 },
      { question: 'Which hook runs a side effect after every render by default?', options: ['useState','useEffect','useMemo','useCallback'], correctIndex: 1 },
      { question: 'How do you pass data from a parent to a child component?', options: ['State','Context','Props','Refs'], correctIndex: 2 },
      { question: 'What is the Virtual DOM?', options: ['A real browser DOM copy','A lightweight in-memory representation of the DOM','A CSS rendering engine','A JavaScript engine'], correctIndex: 1 },
      { question: 'Which method lifts state up to a common ancestor?', options: ['Passing callback props','Using localStorage','Using a global variable','Directly mutating child state'], correctIndex: 0 },
      { question: 'What does the key prop do in a list?', options: ['Styles the element','Helps React identify which items changed','Acts as an index','Sets the order'], correctIndex: 1 },
      { question: 'Which hook memorises a computed value to avoid recalculation?', options: ['useCallback','useRef','useMemo','useEffect'], correctIndex: 2 },
      { question: 'What is a controlled component?', options: ['A component with no state','A component whose form input is driven by React state','A component wrapped in a HOC','A component using refs'], correctIndex: 1 },
      { question: 'What does `React.StrictMode` do?', options: ['Enables TypeScript','Highlights potential problems in development','Disables hooks','Enables server rendering'], correctIndex: 1 },
    ];

    if (s === 'node') return [
      { question: 'Node.js is built on which JavaScript engine?', options: ['SpiderMonkey','Chakra','V8','JavaScriptCore'], correctIndex: 2 },
      { question: 'Which module system is native to Node.js (CommonJS)?', options: ['import/export','require/module.exports','load/expose','include/define'], correctIndex: 1 },
      { question: 'Which core module does Node use for HTTP requests?', options: ['net','fs','http','url'], correctIndex: 2 },
      { question: 'What does `npm init` do?', options: ['Installs all packages','Creates a package.json file','Starts the dev server','Runs tests'], correctIndex: 1 },
      { question: 'Which of the following is used for non-blocking I/O in Node?', options: ['Threads','Callbacks/Promises/async-await','Global variables','Synchronous loops'], correctIndex: 1 },
      { question: 'What is the event loop responsible for in Node.js?', options: ['Compiling TypeScript','Handling asynchronous callbacks','Managing memory','Parsing HTML'], correctIndex: 1 },
      { question: 'Which package is commonly used to create a Node.js web server framework?', options: ['lodash','express','axios','dotenv'], correctIndex: 1 },
      { question: 'How do you read environment variables in Node.js?', options: ['window.env.VAR','process.env.VAR','global.env.VAR','node.env.VAR'], correctIndex: 1 },
      { question: 'Which command runs a Node.js script called app.js?', options: ['npm app.js','node run app.js','node app.js','run app.js'], correctIndex: 2 },
      { question: 'What does `fs.readFileSync` do?', options: ['Reads a file asynchronously','Reads a file synchronously','Writes to a file','Deletes a file'], correctIndex: 1 },
    ];

    if (s === 'mongodb') return [
      { question: 'MongoDB stores data in which format?', options: ['Tables and rows','XML documents','BSON/JSON-like documents','CSV files'], correctIndex: 2 },
      { question: 'What is a collection in MongoDB?', options: ['A row','A table equivalent (group of documents)','A database','An index'], correctIndex: 1 },
      { question: 'Which method inserts one document into a collection?', options: ['collection.insertOne()','collection.save()','collection.add()','collection.create()'], correctIndex: 0 },
      { question: 'Which operator selects documents where a field is greater than a value?', options: ['$lt','$eq','$gt','$ne'], correctIndex: 2 },
      { question: 'What is the unique identifier field automatically added to each MongoDB document?', options: ['id','_key','_id','uid'], correctIndex: 2 },
      { question: 'Which aggregation stage filters documents (similar to SQL WHERE)?', options: ['$group','$match','$project','$sort'], correctIndex: 1 },
      { question: 'What does Mongoose provide in a Node.js application?', options: ['A REST API framework','An ODM (Object Document Mapper) for MongoDB','A query builder for SQL','A caching layer'], correctIndex: 1 },
      { question: 'How do you update a single document in MongoDB?', options: ['collection.update()','collection.updateOne()','collection.set()','collection.change()'], correctIndex: 1 },
      { question: 'Which command connects to a MongoDB shell?', options: ['mongo connect','mongosh','mongodb-cli','db connect'], correctIndex: 1 },
      { question: 'What is sharding in MongoDB?', options: ['Data encryption','Horizontal scaling by distributing data across servers','Backup strategy','Index optimisation'], correctIndex: 1 },
    ];

    if (s === 'git') return [
      { question: 'Which command initialises a new Git repository?', options: ['git start','git init','git new','git create'], correctIndex: 1 },
      { question: 'Which command stages all changes for the next commit?', options: ['git commit -a','git push','git add .','git stage all'], correctIndex: 2 },
      { question: 'Which command creates a new branch?', options: ['git new branch','git branch <name>','git checkout -b <name>','Both B and C'], correctIndex: 3 },
      { question: 'What does `git pull` do?', options: ['Pushes local commits to remote','Fetches and merges remote changes','Only fetches remote changes','Resets the working directory'], correctIndex: 1 },
      { question: 'Which command shows the commit history?', options: ['git show','git history','git log','git status'], correctIndex: 2 },
      { question: 'What does `git merge` do?', options: ['Deletes a branch','Integrates changes from one branch into another','Reverts the last commit','Clones the repository'], correctIndex: 1 },
      { question: 'Which command undoes the last commit but keeps the changes staged?', options: ['git revert HEAD','git reset --hard HEAD~1','git reset --soft HEAD~1','git checkout HEAD~1'], correctIndex: 2 },
      { question: 'What is a .gitignore file used for?', options: ['Ignoring syntax errors','Specifying untracked files to ignore','Hiding remote branches','Setting commit messages'], correctIndex: 1 },
      { question: 'Which command links a local repository to a remote?', options: ['git link','git remote add origin <url>','git connect <url>','git push origin'], correctIndex: 1 },
      { question: 'What does `git stash` do?', options: ['Commits changes','Temporarily shelves uncommitted changes','Deletes the working tree','Tags the current commit'], correctIndex: 1 },
    ];

    if (s === 'n8n') return [
      { question: 'What type of tool is n8n?', options: ['A database management system','A workflow automation platform','A front-end framework','A cloud provider'], correctIndex: 1 },
      { question: 'What is a "node" in n8n?', options: ['A server instance','A step/action in a workflow','A database record','A user account'], correctIndex: 1 },
      { question: 'Which node type starts a workflow in n8n?', options: ['Action node','Trigger node','Webhook node','Schedule node'], correctIndex: 1 },
      { question: 'How does n8n handle data between nodes?', options: ['Via a shared database','Via JSON items passed between nodes','Via environment variables','Via HTTP cookies'], correctIndex: 1 },
      { question: 'What is an HTTP Request node used for?', options: ['Sending emails','Making API calls to external services','Querying a database','Processing files'], correctIndex: 1 },
      { question: 'Which n8n node allows conditional branching?', options: ['Split node','If node','Filter node','Switch node'], correctIndex: 1 },
      { question: 'What does the "Set" node do in n8n?', options: ['Deletes workflow data','Sets or manipulates data fields','Sends a notification','Starts a sub-workflow'], correctIndex: 1 },
      { question: 'n8n can be self-hosted. What does this mean?', options: ['It runs on n8n servers only','You run it on your own infrastructure','It is free forever','It requires no setup'], correctIndex: 1 },
      { question: 'Which format does n8n use for expressions?', options: ['Handlebars {{ }}','Jinja2 {% %}','n8n uses {{ }} with JavaScript expressions','Python f-strings'], correctIndex: 2 },
      { question: 'What is a Webhook trigger node used for?', options: ['Scheduling recurring workflows','Receiving HTTP requests to start a workflow','Connecting to a database','Sending emails'], correctIndex: 1 },
    ];

    // Generic fallback
    return [
      { question: `What is the primary purpose of ${name}?`, options: ['Data storage','Automation and workflows','User interface design','All of the above'], correctIndex: 3 },
      { question: `Which best describes a beginner in ${name}?`, options: ['Can teach others','Understands core concepts but needs guidance','Has no knowledge at all','Is certified'], correctIndex: 1 },
      { question: `How do you measure improvement in ${name}?`, options: ['Track concrete outcomes','Rely on feeling','Change goals daily','Avoid measuring'], correctIndex: 0 },
      { question: `What is the best way to learn ${name}?`, options: ['Read theory only','Combine theory with hands-on practice','Watch videos passively','Memorise syntax'], correctIndex: 1 },
      { question: `When stuck on a problem in ${name}, you should:`, options: ['Give up','Debug systematically and consult docs','Ask someone to do it for you','Restart everything'], correctIndex: 1 },
      { question: `Which habit helps most when working with ${name}?`, options: ['Skipping documentation','Writing clean, readable code/work','Avoiding version control','Working in isolation'], correctIndex: 1 },
      { question: `What does versioning mean in the context of ${name}?`, options: ['Deleting old files','Tracking changes over time','Renaming files','Compressing data'], correctIndex: 1 },
      { question: `How would you explain ${name} to a non-technical person?`, options: ['Use heavy jargon','Use simple analogies and examples','Refuse to explain','Send a long manual'], correctIndex: 1 },
      { question: `What is a best practice when collaborating on ${name} projects?`, options: ['Work alone always','Communicate clearly and document your work','Ignore reviews','Copy-paste without attribution'], correctIndex: 1 },
      { question: `Which indicates mastery of ${name}?`, options: ['Knowing buzzwords','Solving real-world problems effectively','Having many certifications','Memorising tutorials'], correctIndex: 1 },
    ];
  };

  const [questionsState, setQuestionsState] = useState<QA[]>([]);
  const questions = useMemo(() => questionsState, [questionsState]);

  const PREDEFINED_SKILLS = ['sql','python','java','next.js','uiux','react','node','mongodb','git','n8n'];

  useEffect(() => {
    if (!skill) return;
    const skillKey = skill.name.toLowerCase().trim();
    // Use curated questions directly for predefined skills
    if (PREDEFINED_SKILLS.includes(skillKey)) {
      setQuestionsState(getStaticQuestionsForSkill(skill.name));
      return;
    }
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
    if (score < 75) {
      setError('You need at least 75% to add this skill to your profile.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const correct = questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0);
      const summary = `Assessment: ${score}% (${correct}/${questions.length}) — ${level}.`;
      // Insert the skill into the DB only now (after passing)
      const { data, error: insertError } = await supabase
        .from('skills')
        .insert({
          user_id: user.id,
          name: skill.name,
          skill_type: 'teach',
          proficiency_level: level,
          category: null,
          description: summary,
        })
        .select('id')
        .maybeSingle();
      if (insertError) throw insertError;
      setSavedSkillId(data?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteSkillAndRetry = async () => {
    window.location.href = '/dashboard/settings';
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
          {score >= 75 ? (
            <div className="flex items-center gap-2">
              {savedSkillId ? (
                <>
                  <span className="text-green-600 font-medium text-sm">✓ Skill added to your profile!</span>
                  <Button variant="outline" onClick={() => (window.location.href = '/dashboard/settings')}>Go to Settings</Button>
                </>
              ) : (
                <Button onClick={saveAssessmentToSkill} disabled={saving} className="bg-skillswap-500 text-white">{saving ? 'Saving...' : 'Save to profile'}</Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <p className="text-sm text-red-600 font-medium">You need at least 75% to add this skill to your profile.</p>
              <div className="flex items-center gap-2">
                <Button onClick={deleteSkillAndRetry} disabled={saving} className="bg-red-500 text-white hover:bg-red-600">
                  {saving ? 'Removing...' : 'Try Again'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
