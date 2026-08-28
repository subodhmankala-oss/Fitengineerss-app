import { useEffect, useState } from 'react';
import { gravatarUrl, getInitials, getAvatarColor } from '../utils/avatarUtil';

// Renders the logged-in user's real photo wherever the app used to show a
// generic emoji/initials placeholder. Used for both the coach and the
// client, everywhere a client/coach identity is shown.
//
//   <Avatar email={userEmail} name={userName} avatarUrl={userAvatarUrl} size={40} />
//
// avatarUrl (Google's real photo, saved on the users row — see
// databaseService.updateUserAvatarUrl / getUserProfileByEmail) wins when
// present. Otherwise this tries a Gravatar for the email, and falls back to
// an initials circle if neither exists.
export default function Avatar({ email, name, avatarUrl, size = 36, className = '', style = {} }) {
  const [gravatar, setGravatar] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (avatarUrl || !email) return;
    let cancelled = false;
    gravatarUrl(email, Math.max(64, size * 2)).then(url => {
      if (!cancelled) setGravatar(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [email, avatarUrl, size]);

  const src = avatarUrl || gravatar;
  const circleStyle = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, color: '#fff', flexShrink: 0,
    fontSize: Math.max(11, Math.round(size * 0.4)),
    ...style
  };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || email || 'User avatar'}
        className={className}
        style={{ ...circleStyle, objectFit: 'cover' }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={className}
      style={{ ...circleStyle, background: getAvatarColor(name || email) }}
    >
      {getInitials(name, email)}
    </div>
  );
}
