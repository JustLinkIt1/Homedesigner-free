import { useEffect, useRef, useState } from 'react';
import {
  Home, Plus, Ruler, FolderOpen, Copy, Trash2, Pencil, Sofa, ChevronRight,
  LayoutGrid, Settings, Lightbulb, PenTool,
} from 'lucide-react';
import { useDesign, type MaybeFloored } from '../store/designStore';
import { confirmDialog, toast } from '../lib/ui';
import { openProjectFile } from '../lib/projectIO';
import { requirePro } from '../lib/pro';
import { APP_NAME, APP_TAGLINE } from '../lib/appInfo';
import { SAMPLES, samplePreviewUrl } from '../data/samples';
import { useI18n } from '../lib/i18n';
import LanguagePicker from './LanguagePicker';
import AccountButton from './AccountButton';
import * as projects from '../lib/projects';

function timeAgo(ts: number, t: (en: string) => string): string {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins} ${t('min ago')}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${t('h ago')}`;
  const days = Math.round(hours / 24);
  return days === 1 ? t('yesterday') : `${days} ${t('days ago')}`;
}

/**
 * The app's home: every saved design as a card, plus the first-run actions
 * (sample / import / blank). Replaces the old one-shot WelcomeModal.
 */
export default function ProjectsScreen({
  onOpenEditor,
  onImport,
  onHelp,
  onSettings,
}: {
  onOpenEditor: () => void;
  onImport: () => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  // Only actions are needed here — select them individually so this screen
  // doesn't re-render on every design edit (actions are stable references).
  const loadSnapshot = useDesign((st) => st.loadSnapshot);
  const newProjectAction = useDesign((st) => st.newProject);
  const loadSample = useDesign((st) => st.loadSample);
  const t = useI18n();
  const [list, setList] = useState<projects.ProjectMeta[]>(() => projects.listProjects());
  const [renaming, setRenaming] = useState<string | null>(null);
  // Which bottom-nav destination is selected. It's an explicit tapped state
  // (not scroll-spy) — the home content barely overflows, so a scroll-position
  // heuristic can't reliably tell "Home" from "Templates". Tapping a tab
  // highlights it and scrolls; opening Settings (a modal) leaves it unchanged.
  const [activeTab, setActiveTab] = useState<'home' | 'templates'>('home');
  const templatesRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const refresh = () => setList(projects.listProjects());
  useEffect(() => {
    refresh();
    // Fired when a background write (e.g. the async thumbnail) lands.
    window.addEventListener('projects-updated', refresh);
    return () => window.removeEventListener('projects-updated', refresh);
  }, []);

  const openProject = (id: string) => {
    // readProject returns unvalidated storage JSON; loadSnapshot's
    // MaybeFloored contract tolerates missing multi-floor fields.
    const snap = projects.readProject(id) as MaybeFloored | null;
    if (!snap) {
      toast.error(t('Could not open that project — its data is missing.'));
      return;
    }
    projects.setActiveId(id);
    loadSnapshot(snap);
    onOpenEditor();
  };

  const newProject = (then?: () => void) => {
    // Second-and-later projects are the Pro 'projects' feature.
    if (list.length >= 1 && !requirePro('projects')) return;
    projects.createProject();
    newProjectAction();
    onOpenEditor();
    then?.();
  };

  const openSample = (sampleId: string, name: string) => {
    if (list.length >= 1 && !requirePro('projects')) return;
    projects.createProject(name);
    loadSample(sampleId);
    onOpenEditor();
  };

  // Template row = the bundled samples plus Import + Blank actions.
  const templates = [
    ...SAMPLES.map((smp) => ({
      key: smp.id,
      title: t(smp.name),
      sub: t(smp.blurb),
      icon: <Sofa className="icon" />,
      preview: smp.hasPreview ? samplePreviewUrl(smp.id) : undefined,
      onClick: () => openSample(smp.id, smp.name),
    })),
    {
      key: '__import',
      title: t('Import a 2D plan'),
      sub: t('PDF / image / DXF'),
      icon: <Ruler className="icon" />,
      preview: `${import.meta.env.BASE_URL}previews/import.webp`,
      onClick: () => {
        projects.createProject('Imported plan');
        newProjectAction();
        onOpenEditor();
        onImport();
      },
    },
    {
      key: '__blank',
      title: t('Start from scratch'),
      sub: t('Draw walls and rooms yourself'),
      icon: <PenTool className="icon" />,
      preview: `${import.meta.env.BASE_URL}previews/blank.webp`,
      onClick: () => newProject(),
    },
  ];

  return (
    <div className="projects-screen">
      <header className="ps-head">
        <div className="brand">
          <div className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}brand-icon.png`} alt="" width={34} height={34} />
          </div>
          <div className="brand-name">
            {APP_NAME}
            <span className="sub">{APP_TAGLINE}</span>
          </div>
        </div>
        <div className="ps-head-actions">
          <AccountButton />
          <button className="lang-btn ps-settings-btn" onClick={onSettings}>
            <Settings className="icon" />
            <span>{t('Settings')}</span>
          </button>
          <LanguagePicker align="right" />
        </div>
      </header>

      <main className="ps-main" ref={mainRef}>
        {/* Hero */}
        <section className="ps-hero">
          <div className="ps-hero-text">
            <h1>{t('Welcome back')} <span className="ps-wave">👋</span></h1>
            <p>{t('Design your dream home')}</p>
          </div>
          <button className="btn primary ps-hero-new" onClick={() => newProject()}>
            <Plus className="icon" /> {t('New project')}
          </button>
        </section>

        {/* Start a project — template row */}
        <section className="ps-section">
          <div className="ps-section-head">
            <h2>{t('Start a project')}</h2>
          </div>
          <div className="ps-templates-row" ref={templatesRef}>
            {templates.map((tpl, i) => (
              <button
                key={tpl.key}
                className={`tpl-card ${i === 0 ? 'accent' : ''} ${tpl.preview ? 'has-preview' : ''}`}
                onClick={tpl.onClick}
              >
                {tpl.preview ? (
                  <span className="tpl-preview">
                    <img src={tpl.preview} alt="" loading="lazy" />
                  </span>
                ) : (
                  <span className="tpl-ico">{tpl.icon}</span>
                )}
                <span className="tpl-title">{tpl.title}</span>
                <span className="tpl-sub">{tpl.sub}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Your projects */}
        <section className="ps-section">
          <div className="ps-section-head">
            <h2>{t('Your projects')}</h2>
            <button
              className="ps-link"
              onClick={async () => {
                const snap = await openProjectFile();
                if (snap) {
                  projects.createProject(snap.projectName || 'Imported home');
                  loadSnapshot(snap);
                  onOpenEditor();
                }
              }}
            >
              <FolderOpen className="icon" /> {t('Open .json')}
            </button>
          </div>
          {list.length === 0 ? (
            <div className="ps-empty">
              <Home className="icon" />
              <span>{t('No projects yet — start one above.')}</span>
            </div>
          ) : (
            <div className="ps-grid">
              {list.map((p) => (
                <div key={p.id} className="ps-card">
                  <button className="ps-thumb" onClick={() => openProject(p.id)} aria-label={`${t('Open')} ${p.name}`}>
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" />
                    ) : (
                      <span className="ps-thumb-empty">
                        <Home className="icon" />
                      </span>
                    )}
                    <span className="ps-open">
                      {t('Open')} <ChevronRight className="icon" />
                    </span>
                  </button>
                  <div className="ps-meta">
                    {renaming === p.id ? (
                      <input
                        className="ps-rename"
                        defaultValue={p.name}
                        autoFocus
                        onBlur={(e) => {
                          projects.renameProject(p.id, e.target.value.trim() || p.name);
                          setRenaming(null);
                          refresh();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className="ps-name" title={p.name}>{p.name}</span>
                    )}
                    <span className="ps-date">{timeAgo(p.updatedAt, t)}</span>
                  </div>
                  <div className="ps-card-actions">
                    <button title={t('Rename')} aria-label={`${t('Rename')} ${p.name}`} onClick={() => setRenaming(p.id)}>
                      <Pencil className="icon" /> <span>{t('Rename')}</span>
                    </button>
                    <button
                      title={t('Duplicate')}
                      aria-label={`${t('Duplicate')} ${p.name}`}
                      onClick={() => {
                        if (!requirePro('projects')) return;
                        const id = projects.duplicateProject(p.id);
                        if (id) {
                          refresh();
                          toast.success(t('Project duplicated'));
                        }
                      }}
                    >
                      <Copy className="icon" /> <span>{t('Duplicate')}</span>
                    </button>
                    <button
                      title={t('Delete')}
                      aria-label={`${t('Delete')} ${p.name}`}
                      className="danger"
                      onClick={async () => {
                        const ok = await confirmDialog(
                          `${t('Delete')} “${p.name}”?`,
                          t('This permanently removes the project from this device.'),
                          { confirmLabel: t('Delete'), danger: true },
                        );
                        if (ok) {
                          projects.deleteProject(p.id);
                          refresh();
                          toast.info(t('Project deleted'));
                        }
                      }}
                    >
                      <Trash2 className="icon" /> <span>{t('Delete')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Inspiration banner — maps the mockup's "Explore ideas" to the
            built-in Tips & shortcuts panel (honest, real destination). */}
        <button className="ps-inspire" onClick={onHelp}>
          <span className="ps-inspire-ico"><Lightbulb className="icon" /></span>
          <span className="ps-inspire-text">
            <strong>{t('Need inspiration?')}</strong>
            <span>{t('Explore tips to bring your dream home to life.')}</span>
          </span>
          <span className="ps-inspire-cta">{t('Explore ideas')} <ChevronRight className="icon" /></span>
        </button>
      </main>

      {/* Bottom nav (phones) — every tab is a real destination. */}
      <nav className="ps-nav">
        <button
          className={activeTab === 'home' ? 'active' : ''}
          aria-current={activeTab === 'home' ? 'page' : undefined}
          onClick={() => {
            setActiveTab('home');
            mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Home className="icon" /> <span>{t('Home')}</span>
        </button>
        <button
          className={activeTab === 'templates' ? 'active' : ''}
          aria-current={activeTab === 'templates' ? 'page' : undefined}
          onClick={() => {
            setActiveTab('templates');
            templatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          <LayoutGrid className="icon" /> <span>{t('Templates')}</span>
        </button>
        <button onClick={onSettings}>
          <Settings className="icon" /> <span>{t('Settings')}</span>
        </button>
      </nav>
    </div>
  );
}
