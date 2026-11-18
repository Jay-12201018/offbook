import { copy } from '@/lib/copy.ts';
import { hasAndroidPrompt, isAndroid, isIos, isStandalone, promptAndroidInstall } from '@/lib/install.ts';

export function InstallGuide({
  onBack,
  onDismiss,
}: {
  onBack: () => void;
  onDismiss: () => void;
}) {
  const ios = isIos();
  const android = isAndroid() && !ios;
  const canPrompt = hasAndroidPrompt() && android;
  const standalone = isStandalone();

  return (
    <div className="page">
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        返回
      </button>
      <h1 className="title" style={{ fontSize: '1.7rem', margin: '12px 0 16px' }}>
        {copy.installTitle}
      </h1>
      {standalone ? (
        <p style={{ lineHeight: 1.55, marginBottom: 16 }}>
          你已经在主屏幕的图标里。进度就存在这里；如果之前在浏览器标签页里练过，可以到设置里导入。
        </p>
      ) : ios ? (
        <ol style={{ paddingLeft: 20, lineHeight: 1.65, margin: 0 }}>
          <li>请用 Safari 打开这一页，不要用微信内置浏览器或 Chrome。</li>
          <li>点分享（方框上的箭头）。在 iPhone 上，它一般在底部工具栏。</li>
          <li>往下划，选“添加到主屏幕”。</li>
          <li>确认名字是「脱稿」，再点添加。</li>
          <li>以后请从新图标打开。麦克风和进度都只在那个图标里更稳。</li>
        </ol>
      ) : canPrompt ? (
        <>
          <p style={{ lineHeight: 1.55, marginBottom: 16 }}>{copy.installAndroid}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void promptAndroidInstall()}
          >
            {copy.addToHome}
          </button>
        </>
      ) : (
        <p style={{ lineHeight: 1.55 }}>{copy.installAndroid}</p>
      )}
      <p className="helper" style={{ marginTop: 20 }}>
        主屏幕上的应用和浏览器标签页不共用同一份进度。换地方之前，先在设置里导出一份，再导入。
      </p>
      <p className="helper" style={{ marginTop: 10 }}>
        {copy.httpsMic}
      </p>
      {!standalone ? (
        <button type="button" className="btn btn-text" style={{ marginTop: 12 }} onClick={onDismiss}>
          {copy.dismiss}
        </button>
      ) : null}
    </div>
  );
}
