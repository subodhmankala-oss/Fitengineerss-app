import './ContentHub.css';

const ContentHub = () => {
  const posts = [
    {
      id: 1,
      type: 'comic',
      title: 'Comic #4: Stop Rounding Your Back!',
      desc: 'Our latest custom illustration on why lumbar spine neutrality during deadlifts prevents injury and maximizes leverage.',
      imgClass: 'comic-placeholder'
    },
    {
      id: 2,
      type: 'video',
      title: 'Form Check: The Perfect Squat Depth',
      desc: 'Exclusive client-only video breaking down hip crease mobility vs. ego lifting.',
      imgClass: 'video-placeholder'
    },
    {
      id: 3,
      type: 'article',
      title: 'Training Philosophy: The 80/20 Rule',
      desc: 'Why 80% of your results come from 20% of your efforts—focusing on compound lifts and consistent nutrition.',
      imgClass: 'article-placeholder'
    }
  ];

  return (
    <div className="content-container">
      <header className="content-header">
        <h2 className="section-title">Exclusive Hub</h2>
        <p className="section-desc">Distraction-free access to our training philosophy, form-check videos, and custom comic series.</p>
      </header>

      <div className="content-grid">
        {posts.map(post => (
          <div key={post.id} className="glass-panel content-card">
            <div className={`media-container ${post.imgClass}`}>
              {post.type === 'video' && <div className="play-button">▶</div>}
            </div>
            <div className="content-card-body">
              <span className="content-badge">{post.type.toUpperCase()}</span>
              <h3 className="content-title-text">{post.title}</h3>
              <p className="content-summary">{post.desc}</p>
              <button className="btn-secondary read-more">View {post.type}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContentHub;
