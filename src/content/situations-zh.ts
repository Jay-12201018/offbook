/** Learner-facing Chinese situations. Official English `setting` stays for authoring. */

export const DIAGNOSTIC_BRIEFING =
  '三段熟悉话题，大约每分钟 120、150、180 词，先听再问大意，然后准备大约 30 秒，再说大约 45 秒。没有不及格。';

export const SITUATIONS_ZH: Record<string, string> = {
  'diag-listen-120': '一个安静的午后，Maya 和 Chris 打电话，商量这个周末怎么过。',
  'diag-listen-150': 'Maya 和 Chris 在商量周五晚上怎么吃，还是熟悉的闲聊。',
  'diag-listen-180': 'Maya、Chris 和 Jordan 三人快速通话，敲定今晚在哪见、谁订位、怎么回去。',
  'diag-speak-this-week': '朋友问这周过得怎么样。Chris 在安静的房间里，把一件普通的事说给他们听。',

  'pack01-01-i-got-this': '两个朋友吃完一顿平常的晚饭，账单就放在桌子中间。',
  'pack01-02-you-got-last-time': '几天后的一顿便饭。Maya 比 Chris 先伸手去拿账单。',
  'pack01-03-throw-in-for-the-cab': '夜里在餐馆外面等已经叫好的车。里面付钱的时候，Chris 没怎么说话。',
  'pack01-04-card-machine-is-down': '一顿便饭快结束时，服务员 Matt 走回来，看上去有点抱歉。',
  'pack01-05-forgot-my-wallet': '晚饭账单刚上来。Chris 拍了拍口袋，停住了。',
  'pack01-06-next-ones-on-me': '几天后在咖啡柜台。这是 Maya 答应过的“下次我请”。',
  'pack01-07-split-it-three-ways': '和第三个朋友 Jordan 吃完晚饭，三个人还坐着，账单在桌上。',

  'pack02-01-running-late': 'Maya 已经到了咖啡店，Chris 还在家，正要出门。这是一通电话。',
  'pack02-02-im-on-my-way': '又打过来。这次 Chris 已经在车上了，Maya 在决定要不要先占座。',
  'pack02-03-its-pouring': '本来约在外面见，突然下起大雨，两个人一边走一边打电话另找室内的地方。',
  'pack02-04-meet-somewhere-else': '几分钟后，Chris 走到第一家咖啡店，门口已经排起了队。',
  'pack02-05-do-it-tomorrow': '傍晚的电话。Maya 还在上班，两人今晚本来有约。',
  'pack02-06-sorry-im-like-this': '第二天在咖啡店。这次晚到的是 Maya，她一边往街区走，一边打电话。',
  'pack02-07-can-we-push-it': '为了和 Jordan 吃晚饭打电话。Jordan 还脱不开身，Maya 和 Chris 得改时间。',

  'pack03-01-im-out-front': 'Maya 和 Chris 在路边等车去火车站，司机 Luis 把车开了过来。',
  'pack03-02-which-way-is-the-station': 'Maya 拖着行李，在一条不太好认的街上，拦住了路过买菜的 Asha。',
  'pack03-03-reservation-under': '傍晚，Maya 到一家中等酒店办理入住。前台 Anita 快下班了，态度还是很好。',
  'pack03-04-the-trains-delayed': '站台很挤，广播刚响过，可是没听清。Maya 问旁边的乘客 Ben。',
  'pack03-05-you-can-drop-me': '网约车快到酒店了，车道看着有点窄。司机是 Nina。',
  'pack03-06-is-this-the-right-stop': 'Maya 背着包坐在轻轨里，看一站站过去。车开始减速时，她问乘客 Keisha。',
  'pack03-07-rooms-not-ready': 'Maya 到酒店比入住时间早。换了一个前台 Omar，行李就放在脚边。',

  'pack04-01-ill-do-the-burger': 'Maya 和 Chris 已经在一家随意的餐馆坐下。服务员 Jess 拿着便签走过来，不是在背稿。',
  'pack04-02-what-do-you-recommend': '另一家便餐店，傍晚。两人还在看菜单，服务员 Andre 停在桌边。',
  'pack04-03-wrong-order': '还是 Jess 那家店。盘子刚上来，有一份明显不是他们的；Chris 的汉堡上有洋葱。',
  'pack04-04-im-allergic-to': '这家店的菜单里有几道坚果很重的菜。Maya 要点餐之前，先叫住服务员 Sam。',
  'pack04-05-kitchens-backed-up': '两人已经点过了。Jess 再走回来，看上去有点扛不住。',
  'pack04-06-we-could-just-share': '还在同一家餐馆等。Maya 和 Chris 饿得有点逗，想着要不然拼一份。',
  'pack04-07-this-is-not-what-i-ordered': '同一周里，又一次上错了菜。Maya 不想板着脸，Jess 在补救，Chris 话很少。',

  'fallback-daily-just-a-drip': '工作日早上，街角咖啡店。Maya 在柜台点单。',
  'fallback-daily-rain-check': '两个朋友。Maya 约 Chris 明天吃饭，Chris 想婉拒，但不想让人觉得被冷落。',
  'fallback-podcast-long-way-home': '一段像播客开头的独白：有人错过换乘，决定走路回家。',
  'fallback-travel-gate-change': '机场登机口。刚广播说航班换了门，两个旅客在确认。',
  'fallback-work-standup': '早上的短站会，视频通话。Maya 主持，Chris 汇报进度。',
};

export function situationZhFor(id: string, fallback?: string): string {
  return SITUATIONS_ZH[id] || fallback || '';
}

export function looksLikeAuthoringEnglish(text?: string): boolean {
  if (!text) return false;
  if (/[。！？…「」]/.test(text) && /[\u4e00-\u9fff]/.test(text)) return false;
  return /[A-Za-z]{3,}/.test(text) && !/[\u4e00-\u9fff]/.test(text);
}

/** Chinese sidecar first; keep a non-English JSON situationZh; never copy English setting. */
export function overlaySituationZh(id: string, existing?: string): string {
  const zh = situationZhFor(id);
  if (zh) return zh;
  if (existing && !looksLikeAuthoringEnglish(existing)) return existing;
  return '';
}
