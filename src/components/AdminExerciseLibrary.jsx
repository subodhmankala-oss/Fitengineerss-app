import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured } from '../services/databaseService';
import { getYouTubeEmbedUrl } from '../utils/videoUtils';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';

const CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];

const AdminExerciseLibrary = ({ onExerciseCountChange }) => {
  const [exercises, setExercises] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Chest');
  const [primaryMuscle, setPrimaryMuscle] = useState('');
  const [secondaryMuscle, setSecondaryMuscle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [setup, setSetup] = useState('');
  const [execution, setExecution] = useState('');
  const [tip, setTip] = useState('');
  const [videoSource, setVideoSource] = useState('url'); // 'url' | 'upload'
  const [videoFile, setVideoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const fetchExercises = async () => {
    setLoading(true);
    try {
      const data = await databaseService.getExerciseLibrary();
      // Merge, don't choose one-or-the-other — same reasoning as the
      // client/coach ExercisePickerModal: a brand new exercise shipped in
      // code (e.g. "Steppers") only gets INSERTed into the DB by the
      // one-time seed, which only fires when the table is completely empty.
      // On an already-seeded project that insert never runs again, so a
      // static-only exercise silently never showed up here even though the
      // picker (which does this same merge) already offered it to clients.
      // These fallback rows have no `id` — editing one and saving creates
      // it as a real DB row for the first time; deleting is disabled for
      // them below since there's nothing in the DB yet to delete.
      const dbNames = new Set(data.map(e => (e.name || '').toLowerCase()));
      const merged = [
        ...data,
        ...EXERCISE_LIBRARY.filter(e => !dbNames.has(e.name.toLowerCase())).map(e => ({
          name: e.name,
          category: e.category,
          primary_muscle: e.primary,
          secondary_muscle: '',
          video_url: '',
          setup: '',
          execution: '',
          tip: ''
        }))
      ];
      setExercises(merged);
      if (onExerciseCountChange) {
        onExerciseCountChange(merged.length);
      }
    } catch (e) {
      console.error('Error fetching exercise library:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  // Update preview url when videoUrl changes
  useEffect(() => {
    if (videoSource === 'url') {
      const ytEmbed = getYouTubeEmbedUrl(videoUrl);
      setPreviewUrl(ytEmbed || videoUrl);
    }
  }, [videoUrl, videoSource]);

  const handleOpenAdd = () => {
    setEditingExercise(null);
    setName('');
    setCategory('Chest');
    setPrimaryMuscle('');
    setSecondaryMuscle('');
    setVideoUrl('');
    setSetup('');
    setExecution('');
    setTip('');
    setVideoSource('url');
    setVideoFile(null);
    setPreviewUrl('');
    setShowModal(true);
  };

  const handleOpenEdit = (ex) => {
    setEditingExercise(ex);
    setName(ex.name || '');
    setCategory(ex.category || 'Chest');
    setPrimaryMuscle(ex.primary_muscle || '');
    setSecondaryMuscle(ex.secondary_muscle || '');
    setVideoUrl(ex.video_url || '');
    setSetup(ex.setup || '');
    setExecution(ex.execution || '');
    setTip(ex.tip || '');
    setVideoSource('url');
    setVideoFile(null);
    setPreviewUrl(ex.video_url || '');
    setShowModal(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    
    // Create local object URL for preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter an exercise name.');
      return;
    }

    setSaving(true);
    try {
      let finalVideoUrl = videoUrl;

      // Handle video upload if a file was selected
      if (videoSource === 'upload' && videoFile) {
        setUploading(true);
        try {
          finalVideoUrl = await databaseService.uploadExerciseVideo(videoFile);
        } catch (uploadError) {
          alert('Failed to upload video: ' + uploadError.message);
          setSaving(false);
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      const exerciseData = {
        id: editingExercise?.id || null,
        name: name.trim(),
        category,
        primary_muscle: primaryMuscle.trim(),
        secondary_muscle: secondaryMuscle.trim(),
        video_url: finalVideoUrl,
        setup: setup.trim(),
        execution: execution.trim(),
        tip: tip.trim()
      };

      await databaseService.saveExercise(exerciseData);
      alert(editingExercise ? 'Exercise updated successfully!' : 'Exercise added successfully!');
      setShowModal(false);
      fetchExercises();
    } catch (err) {
      console.error('Error saving exercise:', err);
      alert('Failed to save exercise: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ex) => {
    // Fallback rows merged in from the static EXERCISE_LIBRARY (see
    // fetchExercises) have no `id` — there's nothing in the DB yet to
    // delete. The button is disabled for these too; this is just a guard.
    if (!ex.id) return;
    if (!window.confirm(`Delete "${ex.name}" from the exercise library? This can't be undone.`)) return;
    setDeletingId(ex.id);
    try {
      const res = await databaseService.deleteExercise(ex.id);
      if (!res.success) {
        alert('Failed to delete exercise: ' + (res.error || 'unknown error'));
        return;
      }
      setExercises(prev => {
        const next = prev.filter(e => e.id !== ex.id);
        if (onExerciseCountChange) onExerciseCountChange(next.length);
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Flag likely duplicates so they're easy to spot in a long A-Z list: same
  // exercise, different phrasing (e.g. "Push Up" vs "Push-up") — normalize by
  // stripping parens/hyphens/plurals and comparing the remaining word set.
  const normalizeForDuplicateCheck = (name) => {
    let base = (name || '').toLowerCase();
    const paren = (base.match(/\(([^)]+)\)/) || [, ''])[1];
    base = base.replace(/\([^)]*\)/g, '').trim();
    const words = (base + ' ' + paren).split(/[\s-]+/).filter(Boolean).map(w => w.replace(/s$/, ''));
    words.sort();
    return words.join(' ');
  };
  const duplicateGroupCounts = exercises.reduce((acc, ex) => {
    const key = normalizeForDuplicateCheck(ex.name);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Filter exercises
  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = ex.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ex.primary_muscle?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // No side padding of its own — the parent (.platform-admin-view /
  // .admin-content-panel in TrainerDashboard.jsx) already sets the gutter
  // for this whole tab. Having both left this flush at 0px while the KPI
  // cards above kept the parent's inset, reported 2026-08-24 ("Total
  // Clients div is there. The bottom one is not matching them") — one
  // source of truth for the left/right edge instead of two paddings that
  // could drift out of sync.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, boxSizing: 'border-box' }}>
      
      {/* Control bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <input
          type="text"
          placeholder="🔍 Search exercises or muscles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: '1 1 250px',
            padding: '11px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            background: 'rgba(255,255,255,0.03)',
            color: '#fff',
            fontSize: '0.85rem',
            fontFamily: 'inherit'
          }}
        />

        <button
          onClick={handleOpenAdd}
          style={{
            background: 'var(--primary-accent-light)',
            color: '#fff',
            border: 'none',
            padding: '11px 20px',
            borderRadius: '10px',
            fontSize: '0.85rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(139, 92, 246, 0.25)',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          ➕ Add Exercise
        </button>
      </div>

      {/* Category selector pills */}
      <div className="admin-category-pills" style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', margin: '0 -4px' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid',
              borderColor: selectedCategory === cat ? 'var(--primary-accent-light)' : 'rgba(255,255,255,0.08)',
              background: selectedCategory === cat ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255,255,255,0.02)',
              color: selectedCategory === cat ? '#c084fc' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Library Table Card */}
      <div className="glass-panel admin-exercise-table-card" style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '16px',
        overflowX: 'auto'
      }}>
        {loading ? (
          <div className="trainer-loading-container" style={{ padding: '6px 0' }}>
            <div className="trainer-spinner"></div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading exercise list...</p>
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="trainer-empty-state" style={{ padding: '30px 0' }}>
            <h5>No Exercises Found</h5>
            <p>Try refining your search query or category filters.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Exercise</th>
                <th style={{ padding: '10px 8px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Video</th>
                <th style={{ padding: '10px 8px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExercises.map((ex) => {
                const isYouTube = getYouTubeEmbedUrl(ex.video_url);
                const hasVideo = !!ex.video_url;
                const isPossibleDuplicate = duplicateGroupCounts[normalizeForDuplicateCheck(ex.name)] > 1;
                return (
                  <tr key={ex.id || ex.name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '64px' }}>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{ex.name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          <span style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '0.68rem',
                            color: 'var(--text-muted)'
                          }}>
                            {ex.category}
                          </span>
                          {ex.primary_muscle && (
                            <span style={{
                              background: 'rgba(139, 92, 246, 0.08)',
                              border: '1px solid rgba(139, 92, 246, 0.15)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              color: '#c084fc'
                            }}>
                              {ex.primary_muscle}
                            </span>
                          )}
                          {isPossibleDuplicate && (
                            <span title="Another exercise in the library looks like the same movement under a different name" style={{
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: '#fbbf24'
                            }}>
                              ⚠️ Possible duplicate
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {hasVideo ? (
                        <span style={{
                          background: isYouTube ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: isYouTube ? '#f87171' : '#34d399',
                          border: isYouTube ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {isYouTube ? '📺 YouTube' : '📹 MP4'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>— None</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleOpenEdit(ex)}
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border-color)',
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          ⚙️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(ex)}
                          disabled={deletingId === ex.id || !ex.id}
                          title={ex.id ? 'Delete this exercise' : "Not saved to the database yet — edit and save it first"}
                          style={{
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: '#f87171',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: (deletingId === ex.id || !ex.id) ? 'default' : 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            opacity: (deletingId === ex.id || !ex.id) ? 0.5 : 1,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {deletingId === ex.id ? '⏳' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="glass-panel animate-scale-in" style={{
            background: 'var(--bg-modal, #1e293b)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '410px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '20px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.25rem', fontWeight: 800 }}>
                {editingExercise ? '⚙️ Edit Exercise' : '🏋️ Add New Exercise'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '1.3rem', cursor: 'pointer', padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Exercise Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>EXERCISE NAME</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Incline Bench Press"
                  required
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Category */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>CATEGORY</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit'
                  }}
                >
                  {CATEGORIES.filter(c => c !== 'All').map(cat => (
                    <option key={cat} value={cat} style={{ background: '#1e293b' }}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Primary Muscle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>PRIMARY MUSCLE</label>
                <input
                  type="text"
                  value={primaryMuscle}
                  onChange={(e) => setPrimaryMuscle(e.target.value)}
                  placeholder="e.g. Upper Chest"
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Secondary Muscles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>SECONDARY MUSCLES</label>
                <input
                  type="text"
                  value={secondaryMuscle}
                  onChange={(e) => setSecondaryMuscle(e.target.value)}
                  placeholder="e.g. Front Deltoids, Triceps"
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Video Configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-color)', padding: '14px', borderRadius: '10px', background: 'rgba(0,0,0,0.1)' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary-accent-light)' }}>FORM GUIDE VIDEO SOURCE</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => { setVideoSource('url'); setVideoFile(null); }}
                    style={{
                      padding: '8px 12px', borderRadius: '6px', border: 'none',
                      background: videoSource === 'url' ? 'rgba(139,92,246,0.15)' : 'transparent',
                      color: videoSource === 'url' ? '#c084fc' : 'var(--text-muted)',
                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    🔗 Link Web URL / YouTube
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoSource('upload')}
                    style={{
                      padding: '8px 12px', borderRadius: '6px', border: 'none',
                      background: videoSource === 'upload' ? 'rgba(139,92,246,0.15)' : 'transparent',
                      color: videoSource === 'upload' ? '#c084fc' : 'var(--text-muted)',
                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    📤 Upload Raw MP4 File
                  </button>
                </div>

                {videoSource === 'url' ? (
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Paste direct MP4 link, or YouTube video URL"
                    style={{
                      padding: '10px 14px', borderRadius: '8px',
                      background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                      color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit'
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      style={{
                        padding: '6px',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem'
                      }}
                    />
                    {!isSupabaseConfigured && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        * Note: In local development, uploads are simulated to use local placeholder videos.
                      </span>
                    )}
                  </div>
                )}

                {/* Video Live Preview */}
                {previewUrl && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>PREVIEW:</span>
                    {getYouTubeEmbedUrl(previewUrl) ? (
                      <iframe
                        src={getYouTubeEmbedUrl(previewUrl)}
                        title="Youtube Form Preview"
                        frameBorder="0"
                        allowFullScreen
                        style={{ width: '100%', height: '180px', borderRadius: '8px', background: '#000' }}
                      />
                    ) : (
                      <video
                        src={previewUrl}
                        controls
                        playsInline
                        muted
                        style={{ width: '100%', height: '180px', borderRadius: '8px', background: '#000' }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Guides */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>STEP 1: SETUP GUIDE</label>
                <textarea
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                  placeholder="Explain starting position, bench angle, barbell alignment, grip size..."
                  rows={2}
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>STEP 2: EXECUTION GUIDE</label>
                <textarea
                  value={execution}
                  onChange={(e) => setExecution(e.target.value)}
                  placeholder="Explain lowering, range of motion, concentric/eccentric paths..."
                  rows={2}
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>COACH TIPS</label>
                <textarea
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  placeholder="Add form cues, breathing advice, common pitfalls to avoid..."
                  rows={2}
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical'
                  }}
                />
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: saving ? 'rgba(139, 92, 246, 0.4)' : 'var(--primary-accent-light)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: saving ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  marginTop: '10px'
                }}
              >
                {saving 
                  ? (uploading ? '⏳ Uploading Video...' : '⏳ Saving Exercise...') 
                  : (editingExercise ? '💾 Update Exercise' : '💾 Save Exercise')
                }
              </button>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminExerciseLibrary;
