import { useEffect, useState } from 'react';
import { Home, Plus, Ruler, FolderOpen, Copy, Trash2, Pencil, Sofa, ChevronRight } from 'lucide-react';
import { useDesign, type MaybeFloored } from '../store/designStore';
import { confirmDialog, toast } from '../lib/ui';
import { openProjectFile } from '../lib/projectIO';
import { requirePro } from '../lib/pro';
import { APP_NAME, APP_TAGLINE } from '../lib/appInfo';
import { SAMPLES } from '../data/samples';
import { useI18n } from '../lib/i18n';
import LanguagePicker from './LanguagePicker';
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
}: {
  onOpenEditor: () => void;
  onImport: () => void;
}) {
  // Only actions are needed here — select them individually so this screen
  // doesn't re-render on every design edit (actions are stable references).
  const loadSnapshot = useDesign((st) => st.loadSnapshot);
  const newProjectAction = useDesign((st) => st.newProject);
  const loadSample = useDesign((st) => st.loadSample);
  const t = useI18n();
  const [list, setList] = useState<projects.ProjectMeta[]>(() => projects.listProjects());
  const [renaming, setRenaming] = useState<string | null>(null);
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

  return (
    <div className="projects-screen">
      <header className="ps-head">
        <div className="brand">
          <div className="brand-mark">
            <Home className="icon" />
          </div>
          <div className="brand-name">
            {APP_NAME}
            <span className="sub">{APP_TAGLINE}</span>
          </div>
        </div>
        <LanguagePicker align="right" />
      </header>

      <main className="ps-main">
        {list.length === 0 ? (
          <section className="ps-welcome">
            <h1>{t('Design your dream home')}</h1>
            <p>{t('Draw floor plans in 2D, furnish every room, and walk through it in 3D.')}</p>
            <div className="welcome-cards">
              {SAMPLES.map((smp, i) => (
                <button
                  key={smp.id}
                  className={`welcome-card ${i === 0 ? 'primary' : ''}`}
                  onClick={() => openSample(smp.id, smp.name)}
                >
                  <span className="wc-ico"><Sofa className="icon" /></span>
                  <span className="wc-title">{t(smp.name)}</span>
                  <span className="wc-sub">{t(smp.blurb)}</span>
                </button>
              ))}
              <button
                className="welcome-card"
                onClick={() => {
                  projects.createProject('Imported plan');
                  newProjectAction();
                  onOpenEditor();
                  onImport();
                }}
              >
                <span className="wc-ico"><Ruler className="icon" /></span>
                <span className="wc-title">{t('Import a 2D plan')}</span>
                <span className="wc-sub">{t('PDF / image / DXF — walls traced automatically')}</span>
              </button>
              <button className="welcome-card" onClick={() => newProject()}>
                <span className="wc-ico"><Plus className="icon" /></span>
                <span className="wc-title">{t('Start from scratch')}</span>
                <span className="wc-sub">{t('Draw walls and rooms yourself')}</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="ps-toolbar">
              <h1>{t('Your projects')}</h1>
              <div className="ps-actions">
                <button
                  className="btn"
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
                <button className="btn primary" onClick={() => newProject()}>
                  <Plus className="icon" /> {t('New project')}
                </button>
              </div>
            </div>
            <div className="ps-templates">
              <span className="ps-templates-label">{t('Templates:')}</span>
              {SAMPLES.map((smp) => (
                <button key={smp.id} className="chip" title={t(smp.blurb)} onClick={() => openSample(smp.id, smp.name)}>
                  {t(smp.name)}
                </button>
              ))}
            </div>
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
                      <Pencil className="icon" />
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
                      <Copy className="icon" />
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
                      <Trash2 className="icon" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
