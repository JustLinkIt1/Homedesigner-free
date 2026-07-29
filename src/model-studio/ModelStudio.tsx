import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  CloudUpload,
  Download,
  FileBox,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  RefreshCw,
  Send,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Toaster } from '../components/Overlays';
import {
  createStudioJob,
  generateStudioModel,
  getStudioJob,
  getStudioSource,
  listStudioJobs,
  modelStudioConfigured,
  publishStudioModel,
  STUDIO_GENERATORS,
  uploadOptimizedStudioModel,
  type PublishMetadata,
  type StudioGeneratorId,
  type StudioJob,
} from './modelStudioApi';
import type { GlbStats } from './optimizeGlb';
import {
  FURNITURE_CATALOG,
  PUBLISHABLE_CATALOG_CATEGORIES,
  PUBLISHABLE_CATALOG_SHAPES,
} from '../data/furnitureCatalog';
import './modelStudio.css';

const STARTER_PROMPT = 'A modern TV on a stylish media cabinet, with a small stack of books on the left and a decorative vase on the right. Clean product design, realistic materials, isolated object.';
const OVERRIDABLE_ITEMS = FURNITURE_CATALOG.filter((entry) => !entry.opening);

function bytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);
}

function suggestedMetadata(prompt: string): PublishMetadata {
  const lower = prompt.toLowerCase();
  if (/\btv\b|television|media (unit|cabinet|console)/.test(lower)) {
    return {
      mode: 'entry', type: 'tv_media_unit', name: 'TV & Media Unit', category: 'Living',
      shape: 'tv', width: 200, depth: 55, height: 140, color: '#26262b', icon: '📺',
      pro: true, fit: 'contain', yaw: 0, rightsConfirmed: false,
    };
  }
  if (/sofa|couch/.test(lower)) {
    return {
      mode: 'entry', type: 'ai_sofa', name: 'Designer Sofa', category: 'Living',
      shape: 'sofa', width: 210, depth: 95, height: 85, color: '#7b8491', icon: '🛋️',
      pro: true, fit: 'contain', yaw: 0, rightsConfirmed: false,
    };
  }
  if (/chair|armchair/.test(lower)) {
    return {
      mode: 'entry', type: 'ai_armchair', name: 'Designer Armchair', category: 'Living',
      shape: 'chair', width: 85, depth: 85, height: 90, color: '#8a7868', icon: '🪑',
      pro: true, fit: 'contain', yaw: 0, rightsConfirmed: false,
    };
  }
  const first = prompt.split(/[,.]/)[0].replace(/^(a|an|the)\s+/i, '').trim() || 'Generated furniture';
  const name = first.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80);
  return {
    mode: 'entry', type: slug(name) || 'generated_furniture', name, category: 'Living',
    shape: 'box', width: 100, depth: 60, height: 90, color: '#8b7b6b', icon: '▣',
    pro: true, fit: 'contain', yaw: 0, rightsConfirmed: false,
  };
}

function LoadedModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf.scene]);
  return <primitive object={scene} />;
}

function ModelViewer({ url }: { url: string }) {
  return (
    <div className="studio-viewer" aria-label="Interactive 3D model review">
      <Canvas
        key={url}
        dpr={[1, 1.5]}
        camera={{ position: [2.8, 1.9, 3.2], fov: 35, near: 0.01, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        shadows
      >
        <color attach="background" args={['#e9edf4']} />
        <hemisphereLight args={['#ffffff', '#8e95a3', 2.1]} />
        <directionalLight position={[3, 5, 4]} intensity={2.8} castShadow />
        <directionalLight position={[-4, 2, -2]} intensity={1.1} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <Center bottom>
              <LoadedModel url={url} />
            </Center>
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault enablePan={false} minDistance={0.2} maxDistance={15} />
      </Canvas>
      <span className="studio-viewer-hint">Drag to rotate · pinch or scroll to zoom</span>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const working = status === 'queued' || status === 'running';
  return (
    <span className={`studio-status ${status}`}>
      {working ? <LoaderCircle size={13} className="spin" /> : status === 'complete' ? <CheckCircle2 size={13} /> : null}
      {status}
    </span>
  );
}

export default function ModelStudio() {
  const { account, ready, busy: authBusy, configured: authConfigured, restoreSession, signIn, signOut } = useAuthStore();
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = jobs.find((job) => job.id === selectedId) ?? null;
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [reference, setReference] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [localModel, setLocalModel] = useState<File | null>(null);
  const [localModelUrl, setLocalModelUrl] = useState<string | null>(null);
  const [optimized, setOptimized] = useState<Blob | null>(null);
  const [renderOptimized, setRenderOptimized] = useState<Blob | null>(null);
  const [optimizedUrl, setOptimizedUrl] = useState<string | null>(null);
  const [renderOptimizedUrl, setRenderOptimizedUrl] = useState<string | null>(null);
  const [previewTier, setPreviewTier] = useState<'mobile' | 'render'>('mobile');
  const [stats, setStats] = useState<{ before: GlbStats; mobile: GlbStats; render: GlbStats } | null>(null);
  const [metadata, setMetadata] = useState<PublishMetadata>(() => suggestedMetadata(STARTER_PROMPT));
  const [enablePbr, setEnablePbr] = useState(false);
  const [generator, setGenerator] = useState<StudioGeneratorId>('hunyuan-v3.1-pro');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const selectedPrompt = selected?.prompt;
  const selectedCaption = selected?.caption;
  const selectedGenerator = STUDIO_GENERATORS.find((item) => item.id === generator) ?? STUDIO_GENERATORS[0];
  const promptLimit = generator === 'hunyuan-v3.1-rapid' ? 200 : 1024;

  const replaceJob = (next: StudioJob) => {
    setJobs((current) => [next, ...current.filter((job) => job.id !== next.id)]);
    setSelectedId(next.id);
  };

  useEffect(() => { void restoreSession(); }, [restoreSession]);

  useEffect(() => {
    if (!account) return;
    setWorking('Loading model jobs…');
    void listStudioJobs()
      .then((items) => {
        setJobs(items);
        if (items[0]) setSelectedId((current) => current ?? items[0].id);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load Model Studio.'))
      .finally(() => setWorking(''));
  }, [account]);

  useEffect(() => {
    if (!selectedId) return;
    setPrompt(selectedPrompt || selectedCaption || '');
    setMetadata(suggestedMetadata(selectedPrompt || selectedCaption || 'Generated furniture'));
    setOptimized(null);
    setRenderOptimized(null);
    setStats(null);
    const previousGenerator = STUDIO_GENERATORS.find((item) => item.endpoint === selected?.generationTask?.endpoint);
    if (previousGenerator) setGenerator(previousGenerator.id);
  }, [selectedId, selectedPrompt, selectedCaption, selected?.generationTask?.endpoint]);

  useEffect(() => {
    const active = selected && (
      selected.captionTask?.status === 'queued' || selected.captionTask?.status === 'running' ||
      selected.generationTask?.status === 'queued' || selected.generationTask?.status === 'running'
    );
    if (!active || !selected) return;
    const timer = window.setInterval(() => {
      void getStudioJob(selected.id).then(replaceJob).catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [selected]);

  useEffect(() => {
    if (!reference) return;
    const url = URL.createObjectURL(reference);
    setSourcePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [reference]);

  useEffect(() => {
    if (!selected?.sourceUrl || reference) return;
    let disposed = false;
    let url = '';
    void getStudioSource(selected.sourceUrl).then((blob) => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setSourcePreview(url);
    }).catch(() => setSourcePreview(null));
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected?.sourceUrl, reference]);

  useEffect(() => {
    if (!localModel) return;
    const url = URL.createObjectURL(localModel);
    setLocalModelUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localModel]);

  useEffect(() => {
    if (!optimized) return;
    const url = URL.createObjectURL(optimized);
    setOptimizedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [optimized]);

  useEffect(() => {
    if (!renderOptimized) return;
    const url = URL.createObjectURL(renderOptimized);
    setRenderOptimizedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [renderOptimized]);

  const viewerUrl = previewTier === 'render'
    ? renderOptimizedUrl || selected?.renderModel?.url || optimizedUrl || localModelUrl || selected?.model?.url || null
    : optimizedUrl || localModelUrl || selected?.model?.url || null;

  const handleCreate = async () => {
    setError('');
    setWorking(reference ? 'Uploading reference and generating its caption…' : 'Creating model draft…');
    try {
      const job = await createStudioJob({ prompt, image: reference ?? undefined });
      replaceJob(job);
      setReference(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the draft.');
    } finally {
      setWorking('');
    }
  };

  const useCaption = () => {
    if (!selected?.caption) return;
    const clean = `${selected.caption.trim()} Isolated furniture product, complete object, realistic materials, no room, no wall, no floor.`.slice(0, 1024);
    setPrompt(clean);
    setMetadata(suggestedMetadata(clean));
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setError('');
    setWorking(`Submitting ${selectedGenerator.name} textured 3D job…`);
    try {
      replaceJob(await generateStudioModel(selected.id, { prompt, enablePbr, generator }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Generation could not start.');
    } finally {
      setWorking('');
    }
  };

  const handleOptimize = async () => {
    const source = localModel ?? (selected?.model?.url ? await fetch(selected.model.url).then((response) => {
      if (!response.ok) throw new Error(`Model download failed (${response.status})`);
      return response.blob();
    }) : null);
    if (!source) return;
    setError('');
    setWorking('Loading optimizer…');
    try {
      const { optimizeGlb } = await import('./optimizeGlb');
      const result = await optimizeGlb(source, setWorking);
      setOptimized(result.mobile.blob);
      setRenderOptimized(result.render.blob);
      setStats({ before: result.before, mobile: result.mobile.stats, render: result.render.stats });
      setPreviewTier('mobile');
      setWorking('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Model optimization failed.');
      setWorking('');
    }
  };

  const handleStage = async () => {
    if (!selected || !optimized || !renderOptimized) return;
    setWorking('Uploading optimized review model…');
    setError('');
    try {
      replaceJob(await uploadOptimizedStudioModel(selected.id, optimized, renderOptimized));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Optimized model upload failed.');
    } finally {
      setWorking('');
    }
  };

  const handlePublish = async () => {
    if (!selected) return;
    setWorking('Publishing model and catalogue manifest…');
    setError('');
    try {
      const outgoing = { ...metadata, yaw: metadata.yaw * Math.PI / 180 };
      replaceJob(await publishStudioModel(selected.id, outgoing));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Publication failed.');
    } finally {
      setWorking('');
    }
  };

  const selectOverride = (type: string) => {
    const entry = OVERRIDABLE_ITEMS.find((item) => item.type === type);
    if (!entry) return;
    setMetadata({
      ...metadata,
      mode: 'override',
      type: entry.type,
      name: entry.name,
      category: entry.category,
      shape: entry.shape,
      width: entry.width,
      depth: entry.depth,
      height: entry.height,
      color: entry.color,
      icon: entry.icon,
      pro: !!entry.pro,
    });
  };

  const selectPublishMode = (mode: PublishMetadata['mode']) => {
    if (mode === 'override') {
      const matching = OVERRIDABLE_ITEMS.find((entry) => entry.type === metadata.type)
        ?? OVERRIDABLE_ITEMS.find((entry) => entry.shape === metadata.shape)
        ?? OVERRIDABLE_ITEMS[0];
      if (matching) selectOverride(matching.type);
      return;
    }
    setMetadata({ ...metadata, mode });
  };

  if (!ready) {
    return <main className="model-studio centered"><LoaderCircle className="spin" /> Checking Google session…</main>;
  }

  if (!account) {
    return (
      <main className="model-studio centered">
        <section className="studio-login">
          <LockKeyhole size={40} />
          <h1>HomeDesigner Model Studio</h1>
          <p>This private production tool requires the owner Google account. Fal and Cloudflare keys never reach the browser.</p>
          <button className="studio-primary" onClick={() => void signIn()} disabled={!authConfigured || authBusy}>
            <LogIn size={18} /> {authBusy ? 'Signing in…' : 'Sign in with Google'}
          </button>
          <a href="./"><ArrowLeft size={16} /> Back to HomeDesigner</a>
        </section>
        <Toaster />
      </main>
    );
  }

  return (
    <main className="model-studio">
      <header className="studio-header">
        <a href="./" className="studio-back"><ArrowLeft size={18} /> HomeDesigner</a>
        <div>
          <span className="studio-eyebrow"><Sparkles size={15} /> Private production tool</span>
          <h1>Model Studio</h1>
        </div>
        <button className="studio-account" onClick={() => void signOut()} title="Sign out">
          {account.imageUrl ? <img src={account.imageUrl} alt="" /> : null}
          <span>{account.email}</span>
        </button>
      </header>

      {!modelStudioConfigured() && <div className="studio-alert error">The Model Studio server URL is not configured in this build.</div>}
      {error && <div className="studio-alert error">{error}</div>}
      {working && <div className="studio-alert working"><LoaderCircle size={16} className="spin" /> {working}</div>}

      <div className="studio-layout">
        <aside className="studio-sidebar">
          <section className="studio-card new-model">
            <h2><ImagePlus size={18} /> Start a model</h2>
            <p>Write the prompt directly, or add an image only to generate editable description text.</p>
            <label className="studio-drop">
              {sourcePreview ? <img src={sourcePreview} alt="Reference" /> : <><ImagePlus /><span>Optional reference image</span><small>JPG, PNG or WebP · 8 MB max</small></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReference(event.target.files?.[0] ?? null)} />
            </label>
            <textarea value={prompt} maxLength={1024} rows={6} onChange={(event) => setPrompt(event.target.value)} />
            <button className="studio-primary" onClick={() => void handleCreate()} disabled={!!working || (!prompt.trim() && !reference)}>
              <WandSparkles size={17} /> {reference ? 'Create & caption' : 'Create text draft'}
            </button>
          </section>

          <section className="studio-card jobs-card">
            <div className="studio-card-title">
              <h2>Recent drafts</h2>
              <button className="icon-button" onClick={() => void listStudioJobs().then(setJobs)} aria-label="Refresh jobs"><RefreshCw size={16} /></button>
            </div>
            <div className="studio-jobs">
              {jobs.length === 0 ? <p className="muted">No model drafts yet.</p> : jobs.map((job) => (
                <button key={job.id} className={selectedId === job.id ? 'selected' : ''} onClick={() => setSelectedId(job.id)}>
                  <FileBox size={17} />
                  <span><strong>{job.published?.type || job.prompt.slice(0, 42) || 'Image caption draft'}</strong><small>{new Date(job.updatedAt).toLocaleString()}</small></span>
                  <StatusPill status={job.generationTask?.status || job.captionTask?.status} />
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="studio-main">
          <section className="studio-card prompt-card">
            <div className="studio-step">1</div>
            <div className="studio-step-content">
              <h2>Describe the model</h2>
              {selected?.caption && (
                <div className="studio-caption">
                  <p>{selected.caption}</p>
                  <button onClick={useCaption}><Sparkles size={15} /> Use AI description</button>
                </div>
              )}
              <textarea value={prompt} maxLength={promptLimit} rows={4} onChange={(event) => setPrompt(event.target.value)} />
              <div className="studio-generator">
                <label htmlFor="studio-generator">Generation model</label>
                <select id="studio-generator" value={generator} onChange={(event) => setGenerator(event.target.value as StudioGeneratorId)}>
                  {STUDIO_GENERATORS.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} — {item.description}</option>
                  ))}
                </select>
                <small>Textured GLB is always enabled. Untextured geometry-only output is blocked. Prompt: {prompt.length}/{promptLimit}.</small>
              </div>
              <div className="studio-row wrap">
                <label className="studio-check"><input type="checkbox" checked={enablePbr} onChange={(event) => setEnablePbr(event.target.checked)} /> Add PBR material maps (+$0.15)</label>
                <span className="studio-cost">
                  Estimated total: ${(selectedGenerator.basePrice + (enablePbr ? 0.15 : 0)).toFixed(3)} · textured{enablePbr ? ' + PBR' : ''}
                </span>
                <button className="studio-primary" onClick={() => void handleGenerate()} disabled={!selected || prompt.trim().length < 10 || prompt.trim().length > promptLimit || !!working}>
                  <Send size={16} /> Generate 3D model
                </button>
              </div>
            </div>
          </section>

          <section className="studio-card review-card">
            <div className="studio-step">2</div>
            <div className="studio-step-content">
              <div className="studio-card-title">
                <div><h2>Inspect & optimize</h2><p>Rotate every side. Check shape, texture, base alignment and unwanted background pieces.</p></div>
                {selected?.model && <span>{bytes(selected.model.bytes)} {selected.model.optimized ? '· mobile ready' : '· raw'}</span>}
              </div>
              {(renderOptimizedUrl || selected?.renderModel?.url) && (
                <div className="studio-tier-toggle">
                  <button className={previewTier === 'mobile' ? 'active' : ''} onClick={() => setPreviewTier('mobile')}>Interactive</button>
                  <button className={previewTier === 'render' ? 'active' : ''} onClick={() => setPreviewTier('render')}>HD render</button>
                </div>
              )}
              {viewerUrl ? <ModelViewer url={viewerUrl} /> : (
                <div className="viewer-empty"><Box size={34} /><span>Generate or load a GLB to inspect it here</span></div>
              )}
              <div className="studio-row wrap review-actions">
                <label className="studio-secondary file-button"><FileBox size={16} /> Load local GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => setLocalModel(event.target.files?.[0] ?? null)} /></label>
                <button className="studio-secondary" onClick={() => void handleOptimize()} disabled={!viewerUrl || !!working}><WandSparkles size={16} /> Make mobile copy</button>
                {optimized && renderOptimized && <button className="studio-primary" onClick={() => void handleStage()} disabled={!selected || !!working}><CloudUpload size={16} /> Stage both copies</button>}
                {optimizedUrl && <a className="studio-secondary" href={optimizedUrl} download="homedesigner-model.mobile.glb"><Download size={16} /> Download</a>}
                {renderOptimizedUrl && <a className="studio-secondary" href={renderOptimizedUrl} download="homedesigner-model.render.glb"><Download size={16} /> HD copy</a>}
              </div>
              {stats && (
                <div className="studio-stats">
                  <span>Raw <strong>{bytes(stats.before.bytes)}</strong> · {stats.before.triangles.toLocaleString()} triangles</span>
                  <span>Interactive <strong>{bytes(stats.mobile.bytes)}</strong> · {stats.mobile.triangles.toLocaleString()} · {stats.mobile.maxTextureSize ?? 1024}px</span>
                  <span>Render <strong>{bytes(stats.render.bytes)}</strong> · {stats.render.triangles.toLocaleString()} · {stats.render.maxTextureSize ?? 2048}px</span>
                </div>
              )}
            </div>
          </section>

          <section className="studio-card publish-card">
            <div className="studio-step">3</div>
            <div className="studio-step-content">
              <h2>Catalogue details</h2>
              <p>These fields are the exact data HomeDesigner reads. Publishing uploads the immutable GLB first and the catalogue manifest last.</p>
              <div className="studio-fields">
                <label>Publish as<select value={metadata.mode} onChange={(event) => selectPublishMode(event.target.value as PublishMetadata['mode'])}><option value="entry">New item</option><option value="override">Replace existing model</option></select></label>
                {metadata.mode === 'override' ? (
                  <label>Existing item<select value={metadata.type} onChange={(event) => selectOverride(event.target.value)}>{OVERRIDABLE_ITEMS.map((entry) => <option key={entry.type} value={entry.type}>{entry.name}</option>)}</select></label>
                ) : (
                  <label>Type / slug<input value={metadata.type} onChange={(event) => setMetadata({ ...metadata, type: slug(event.target.value) })} /></label>
                )}
                <label>Name<input value={metadata.name} onChange={(event) => setMetadata({ ...metadata, name: event.target.value })} /></label>
                <label>Category<select value={metadata.category} onChange={(event) => setMetadata({ ...metadata, category: event.target.value })}>{PUBLISHABLE_CATALOG_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                <label>Object type<select value={metadata.shape} onChange={(event) => setMetadata({ ...metadata, shape: event.target.value })}>{PUBLISHABLE_CATALOG_SHAPES.map((shape) => <option key={shape} value={shape}>{shape.replace(/_/g, ' ')}</option>)}</select></label>
                <label>Icon<input value={metadata.icon} onChange={(event) => setMetadata({ ...metadata, icon: event.target.value })} /></label>
                <label>Width (cm)<input type="number" value={metadata.width} onChange={(event) => setMetadata({ ...metadata, width: Number(event.target.value) })} /></label>
                <label>Depth (cm)<input type="number" value={metadata.depth} onChange={(event) => setMetadata({ ...metadata, depth: Number(event.target.value) })} /></label>
                <label>Height (cm)<input type="number" value={metadata.height} onChange={(event) => setMetadata({ ...metadata, height: Number(event.target.value) })} /></label>
                <label>Colour<input type="color" value={metadata.color} onChange={(event) => setMetadata({ ...metadata, color: event.target.value })} /></label>
                <label>Fit<select value={metadata.fit} onChange={(event) => setMetadata({ ...metadata, fit: event.target.value as PublishMetadata['fit'] })}><option value="contain">Contain</option><option value="width">Width</option><option value="depth">Depth</option><option value="stretch">Stretch</option></select></label>
                <label>Yaw (degrees)<input type="number" value={metadata.yaw} onChange={(event) => setMetadata({ ...metadata, yaw: Number(event.target.value) })} /></label>
              </div>
              <div className="studio-row wrap">
                <label className="studio-check"><input type="checkbox" checked={metadata.pro} onChange={(event) => setMetadata({ ...metadata, pro: event.target.checked })} /> Pro catalogue item</label>
                <label className="studio-check rights"><input type="checkbox" checked={metadata.rightsConfirmed} onChange={(event) => setMetadata({ ...metadata, rightsConfirmed: event.target.checked })} /> I own or have permission to use the reference and approve this generated asset for the app.</label>
              </div>
              <button className="studio-publish" onClick={() => void handlePublish()} disabled={!selected?.model?.optimized || !metadata.rightsConfirmed || !!working}>
                <CloudUpload size={18} /> Publish to HomeDesigner
              </button>
              {selected?.published && <div className="published-note"><CheckCircle2 size={17} /> Published as <strong>{selected.published.type}</strong></div>}
            </div>
          </section>
        </section>
      </div>
      <Toaster />
    </main>
  );
}
