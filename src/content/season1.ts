/**
 * Season 1, chapter 1 (batch 1): episode metadata layered on top of the
 * original scene JSON in public/content/scenes. All text here is original.
 */

export interface CallOption {
  /** Natural model answer. Used as tap-to-answer chip and as "更自然的说法". */
  say: string;
  /** Lowercase keywords / fragments; any hit counts as this intent. */
  kw: string[];
  /** Partner's short reaction before the next turn. */
  react: string;
}

export interface CallTurn {
  /** Partner line (spoken). */
  line: string;
  zh: string;
  options: CallOption[];
  hint: { zh: string; first: string };
}

export interface CallScript {
  partner: string; // speaker id
  sceneZh: string; // one short line shown on the call screen
  turns: CallTurn[];
  bye: string;
}

export interface EpisodeMeta {
  id: string; // scene id
  no: number;
  hookZh: string;
  gist: { q: string; options: string[]; answer: number };
  lineZh: Record<string, string>;
  call: CallScript;
}

export const CHAPTERS = [
  { id: 'ch1', titleZh: '谁来买单', titleEn: 'Who pays', ready: true },
  { id: 'ch2', titleZh: '计划有变', titleEn: 'Change of plans', ready: false },
  { id: 'ch3', titleZh: '在路上', titleEn: 'On the road', ready: false },
  { id: 'ch4', titleZh: '点餐', titleEn: 'Ordering', ready: false },
  { id: 'ch5', titleZh: '原速挑战', titleEn: 'Full speed', ready: false },
];

export const EPISODES: EpisodeMeta[] = [
  {
    id: 'pack01-01-i-got-this',
    no: 1,
    hookZh: '账单放在桌上，谁先伸手？',
    gist: {
      q: '他们在聊什么？',
      options: ['谁来付这顿饭钱', '下次去哪里吃', '打车要多久'],
      answer: 0,
    },
    lineZh: {
      l1: '好啦，那……咱们就 AA 吧？',
      l2: '不用，这次我来。',
      l3: '你确定？我可以出一点，比如……一半？',
      l4: '没事。真的。我来。',
      l5: 'Chris，别这样。上周晚饭就是你请的。',
      l6: '是啊，但今晚是我约你出来的。算是吧。我是说，地方是我挑的。',
      l7: '那不是——好吧，不是这么算的。',
      l8: '为什么不是？',
      l9: '因为那样我会觉得别扭。就让我出点什么吧。',
      l10: '那等会儿打车钱你出？这样可以。',
      l11: '打车？那也就，多少，十二块钱。',
      l12: '那就出打车钱。晚饭我来。',
      l13: '行吧。但下次我请。我是认真的。',
      l14: '好好好。你每次都这么说。',
      l15: '这次我说到做到。',
      l16: '好。下次你请。剩下的薯条你要吗，还是……？',
      l17: '天哪。要。给我。',
    },
    call: {
      partner: 'maya',
      sceneZh: '晚饭吃完了，账单在桌上。你想请客。',
      turns: [
        {
          line: 'Okay, so... you wanna just split this?',
          zh: '那……咱们就 AA 吧？',
          options: [
            { say: 'Nah, I got this.', kw: ['got this', 'got it', 'i can get', "i'll get", 'i will get', 'my treat', 'on me', 'i pay', "i'll pay", 'let me'], react: 'Wait, really?' },
            { say: "Sure, let's split it.", kw: ['split', 'half', 'sure', 'okay', 'ok', 'fine'], react: 'Hmm, actually, you know what?' },
          ],
          hint: { zh: '说「不用，这次我来」', first: 'Nah, I…' },
        },
        {
          line: "You sure? You got dinner last week.",
          zh: '你确定？上周晚饭就是你请的。',
          options: [
            { say: "Yeah, I'm sure. I picked the place.", kw: ['sure', 'yeah', 'yes', 'picked', 'fine', 'really', 'seriously', 'no problem'], react: 'Okay, okay.' },
            { say: "It's fine, seriously. You can get the next one.", kw: ['next', 'next time', 'next one'], react: 'Deal.' },
          ],
          hint: { zh: '说「我确定，地方是我挑的」', first: "Yeah, I'm…" },
        },
        {
          line: 'At least let me throw in something.',
          zh: '至少让我出一点吧。',
          options: [
            { say: 'You can throw in for the cab.', kw: ['cab', 'taxi', 'uber', 'ride'], react: "The cab? That's like twelve bucks. Fine." },
            { say: "You can get the next one. Deal?", kw: ['next', 'deal', 'coffee', 'drink', 'tip'], react: "Deal. I'm serious, though." },
            { say: "Okay, throw in a little. That's fine.", kw: ['okay', 'ok', 'fine', 'sure', 'little', 'half'], react: 'Thank you. See? Easy.' },
          ],
          hint: { zh: '让她出打车钱', first: 'You can throw…' },
        },
        {
          line: "But I'm getting next time. I mean it.",
          zh: '但下次我请。我是认真的。',
          options: [
            { say: "Okay. Next one's on you.", kw: ['next one', 'on you', 'okay', 'ok', 'deal', 'sure', 'fine', 'yeah'], react: 'Good.' },
            { say: 'Yeah, yeah. You always say that.', kw: ['always', 'say that', 'heard that'], react: 'I mean it this time!' },
          ],
          hint: { zh: '说「好，下次你请」', first: "Okay. Next one's…" },
        },
      ],
      bye: 'Now give me the rest of those fries.',
    },
  },
  {
    id: 'pack01-02-you-got-last-time',
    no: 2,
    hookZh: '这次轮到 Maya 抢着买单了。',
    gist: {
      q: 'Maya 为什么坚持这次她来付？',
      options: ['上次是 Chris 请的', '她今天发工资了', 'Chris 没带钱'],
      answer: 0,
    },
    lineZh: {
      l1: '别想了。这次我来。',
      l2: '你确定？',
      l3: '确定。上次是你请的。再上次也算是。',
      l4: '我没有——等等，是吗？',
      l5: '是。就是你。那家面馆？然后打车也是你付的，记得吗？',
      l6: '哦。对。好吧，可这顿午饭也就十二块钱。',
      l7: '我不管。我说过下一次我请。我是认真的。',
      l8: '你要把这事搞得很隆重。',
      l9: '没有很隆重。就……别搞得那么别扭。让我付。',
      l10: '我没搞别扭。是你搞得有点别扭。',
      l11: 'Chris。',
      l12: '好好好。你来。谢谢。',
      l13: '谢谢你。看吧？有那么难吗？',
      l14: '嗯。那等下我请你喝杯咖啡，还是这也不行？',
      l15: '天哪。咖啡你请吧。',
      l16: '我开玩笑的。有一点吧。',
      l17: '不，你买咖啡。我买单的力气都用完了。',
    },
    call: {
      partner: 'chris',
      sceneZh: '上次是 Chris 请的。这顿你想买单。',
      turns: [
        {
          line: "Oh, here, I'll just grab the check.",
          zh: '哦，账单我拿一下。',
          options: [
            { say: "Don't even. I got this.", kw: ["don't", 'no', 'got this', 'got it', 'my turn', 'on me', 'i pay', 'let me', 'mine'], react: 'Whoa, okay.' },
            { say: 'You got last time.', kw: ['last time', 'you paid', 'you got'], react: 'Did I?' },
          ],
          hint: { zh: '说「别想了，这次我来」', first: "Don't even…" },
        },
        {
          line: 'You sure? I feel like I owe you.',
          zh: '你确定？我觉得是我欠你的。',
          options: [
            { say: 'No, you got last time. And the cab.', kw: ['last time', 'cab', 'you paid', 'you got', 'noodle'], react: 'Oh. Right.' },
            { say: "Yes, I'm sure. Don't make it weird.", kw: ['sure', 'yes', 'yeah', 'weird', 'serious'], react: "I'm not making it weird!" },
          ],
          hint: { zh: '提醒他：上次是你请的', first: 'No, you got…' },
        },
        {
          line: "Okay, but it's like a twelve-dollar lunch.",
          zh: '好吧，可这顿午饭也就十二块钱。',
          options: [
            { say: "I don't care. I said next one's on me.", kw: ["don't care", 'next one', 'on me', 'said', 'promise'], react: 'Okay, okay. You got it. Thank you.' },
            { say: "Just let me get it. Don't make it weird.", kw: ['let me', 'weird', 'just', 'get it'], react: 'Fine. Thank you.' },
          ],
          hint: { zh: '说「我不管，我说过下次我请」', first: "I don't care…" },
        },
        {
          line: 'Can I at least get the coffee after?',
          zh: '那等下咖啡至少让我请吧？',
          options: [
            { say: 'Sure, you can get the coffee.', kw: ['sure', 'yes', 'yeah', 'okay', 'ok', 'fine', 'coffee'], react: 'Deal.' },
            { say: "Ha. Fine. Coffee's on you.", kw: ['on you', 'fine', 'deal'], react: 'Deal.' },
          ],
          hint: { zh: '答应他请咖啡', first: 'Sure, you can…' },
        },
      ],
      bye: "See? That wasn't hard.",
    },
  },
  {
    id: 'pack01-03-throw-in-for-the-cab',
    no: 3,
    hookZh: 'Chris 偷偷把账结了。',
    gist: {
      q: '晚饭是谁付的？他们现在在干什么？',
      options: ['Chris 付了，在等车', 'Maya 付了，在走路回家', '还没付，在排队'],
      answer: 0,
    },
    lineZh: {
      l1: '好，车大概还有四分钟。',
      l2: '好。你已经付了？我连账单都没看到。',
      l3: '嗯，我在里面付了。',
      l4: 'Chris。我们说好的。',
      l5: '我知道，我知道。打车钱你出吧。',
      l6: '那不一样，你心里清楚。',
      l7: '打车也是钱啊。我不想站在这儿算账。',
      l8: '我没要算账。我就是……打车钱我来出，然后明天早餐我请。',
      l9: '早餐？',
      l10: '对。我要找这附近最贵的鸡蛋。',
      l11: '哇哦。',
      l12: '是你先开始的。',
      l13: '行。早餐你请。要不咱们进去等？外面有点风。',
      l14: '好，好，进去等吧。你拿收据了吗？',
      l15: '呃，应该在我卡上有记录。没事。',
      l16: '好。早餐我还是要请。',
      l17: '我信你。暂时。',
    },
    call: {
      partner: 'chris',
      sceneZh: '你们在门口等车。Chris 已经偷偷付了钱。',
      turns: [
        {
          line: "Okay, cab's like four minutes out.",
          zh: '好，车大概还有四分钟。',
          options: [
            { say: 'Cool. Wait, did you already pay?', kw: ['already pay', 'did you pay', 'you paid', 'pay', 'check', 'bill'], react: 'Uh... yeah. I got it inside.' },
            { say: "Cool. Hey, I didn't even see the check.", kw: ['see the check', 'check', 'bill', 'cool', 'okay'], react: 'Yeah... I kinda got it inside.' },
          ],
          hint: { zh: '问他：你已经付了吗？', first: 'Did you already…' },
        },
        {
          line: 'I know, I know. You can throw in for the cab.',
          zh: '我知道我知道。打车钱你出吧。',
          options: [
            { say: "Okay, I can throw in for the cab.", kw: ['cab', 'okay', 'ok', 'fine', 'throw in'], react: 'There you go.' },
            { say: "That's not the same and you know it.", kw: ['not the same', 'know it', 'not fair', 'come on'], react: "It's a cab! It's something." },
          ],
          hint: { zh: '说「好，打车钱我来」', first: 'Okay, I can…' },
        },
        {
          line: "I just don't wanna stand here and do math.",
          zh: '我只是不想站在这儿算账。',
          options: [
            { say: 'No math. I get the cab, and I get breakfast tomorrow.', kw: ['breakfast', 'tomorrow', 'next time', 'next one'], react: 'Breakfast? Wow. Fine.' },
            { say: "Fine, no math. But I'm getting the next one.", kw: ['next', 'fine', 'no math', 'okay'], react: 'Deal.' },
          ],
          hint: { zh: '提议：打车钱我出，明天早餐我请', first: 'No math. I get…' },
        },
        {
          line: "It's kind of windy. You wanna just wait inside?",
          zh: '外面有点风。要不进去等？',
          options: [
            { say: "Yeah, let's wait inside.", kw: ['yeah', 'yes', 'inside', 'sure', 'okay', 'ok', "let's", 'good idea'], react: 'Cool.' },
            { say: "I'm good out here. It's only four minutes.", kw: ['good', 'out here', 'minutes', 'fine'], react: 'Tough. Okay.' },
          ],
          hint: { zh: '说「好，进去等吧」', first: "Yeah, let's…" },
        },
      ],
      bye: "And yes, you're getting breakfast. I believe you. For now.",
    },
  },
  {
    id: 'pack01-04-card-machine-is-down',
    no: 4,
    hookZh: '刷卡机坏了，你身上只有卡。',
    gist: {
      q: '出了什么麻烦？',
      options: ['刷卡机坏了，要付现金', '菜上错了', '餐厅要关门了'],
      answer: 0,
    },
    lineZh: {
      l1: '嗨，那个，挺烦的，我们的刷卡机坏了。你们有现金吗？',
      l2: '哦。呃。我大概只有……六块钱。',
      l3: '我只带了卡。真是的。',
      l4: '是啊，整晚都坏着。隔壁便利店里有台取款机，如果有帮助的话。',
      l5: '我跑一趟隔壁吧。没问题。',
      l6: '你确定？我可以陪你去。',
      l7: '不用，我去就行。大概两分钟。',
      l8: '好。我看着座位。要不把外套留下？',
      l9: '好。谢了。他要是回来，就说我去取钱了。',
      l10: '知道了。',
      l11: '谢谢你们。再说声抱歉。这机器一整周都在给我们出状况。',
      l12: '没事。常有的。',
      l13: '他回来以后要我出一点吗？至少我可以给你那六块。',
      l14: '你们怎么方便怎么来。我一会儿再过来。',
      l15: '好。我马上回来。',
      l16: '别在取款机那儿排丢了位置。晚上那些机器怪怪的。',
      l17: '不会的。跟他说我两分钟就回。这次是真的。',
    },
    call: {
      partner: 'matt',
      sceneZh: '你要结账，服务员 Matt 一脸抱歉地走过来。',
      turns: [
        {
          line: "Hey, so, this is annoying, but our card machine's down. Do you have cash?",
          zh: '那个，挺烦的，我们的刷卡机坏了。你有现金吗？',
          options: [
            { say: "Oh no. I only have a card.", kw: ['only have a card', 'card', 'no cash', "don't have", 'no'], react: "Yeah, sorry. It's been down all night." },
            { say: 'Uh, I have a little cash. Like six bucks.', kw: ['little', 'bucks', 'dollars', 'some', 'six'], react: "Hmm, the total's a bit more than that." },
          ],
          hint: { zh: '说「我只带了卡」', first: 'I only have…' },
        },
        {
          line: "There's an ATM in the store next door, if that helps.",
          zh: '隔壁店里有台取款机，如果有帮助的话。',
          options: [
            { say: 'Okay, I can run next door.', kw: ['next door', 'run', 'go', 'atm', 'okay', 'ok', 'sure'], react: 'Great. No rush.' },
            { say: 'Can I pay with my phone instead?', kw: ['phone', 'apple pay', 'venmo', 'online', 'transfer', 'instead'], react: "Let me check. Honestly, the ATM's faster." },
          ],
          hint: { zh: '说「好，我跑一趟隔壁」', first: 'Okay, I can…' },
        },
        {
          line: 'Want me to hold the check for you?',
          zh: '要我先帮你把账单留着吗？',
          options: [
            { say: "Yes, please. I'll be like two minutes.", kw: ['yes', 'please', 'minutes', 'thanks', 'thank you', 'sure'], react: 'You got it.' },
            { say: "That'd be great. Sorry about this.", kw: ['great', 'sorry', 'appreciate'], react: "You're good. Happens." },
          ],
          hint: { zh: '说「好的，我两分钟就回来」', first: "Yes, please. I'll…" },
        },
        {
          line: "Appreciate you. Sorry again. This thing's been dying all week.",
          zh: '谢谢你。再次抱歉。这机器坏了一整周了。',
          options: [
            { say: "You're good. Happens.", kw: ['good', 'happens', 'no problem', 'no worries', 'okay', "it's fine", 'all good'], react: 'Thanks for being cool about it.' },
            { say: "No worries. I'll be right back.", kw: ['right back', 'be back', 'worries'], react: 'Sounds good.' },
          ],
          hint: { zh: '说「没事，常有的」', first: "You're…" },
        },
      ],
      bye: "Don't lose your place at the ATM. They get weird at night.",
    },
  },
  {
    id: 'pack01-05-forgot-my-wallet',
    no: 5,
    hookZh: '账单来了，Chris 摸了摸口袋……',
    gist: {
      q: '出了什么事？最后怎么解决？',
      options: ['Chris 忘带钱包，Maya 先付', 'Maya 忘带手机，Chris 付', '两人 AA'],
      answer: 0,
    },
    lineZh: {
      l1: '哦不。',
      l2: '怎么了。',
      l3: '我忘带钱包了。应该在家里桌上。或者在另一件外套里。我不……对。我没带。',
      l4: '你认真的？',
      l5: '非常认真。对不起。是我的错。真的是我的错。',
      l6: '没事。我先帮你付。我来。',
      l7: '你确定？我觉得自己像个傻子。',
      l8: '你不是傻子。你只是一个忘了带钱包的人。这顿我先付，你回头还我。',
      l9: '我今晚就还你。一到家我就转给你。',
      l10: '或者下次你请就行。不用搞得那么隆重。',
      l11: '好。嗯。下次我请，说真的。这次我都不开玩笑了。',
      l12: '很好。既然我付钱，我要点那个好的意面。',
      l13: '公平。完全公平。',
      l14: '你要不要再请个甜点，还是这权力太大了？',
      l15: '点甜点吧。我活该。',
      l16: '你确实有点活该。',
      l17: '我知道。谢谢你。真的。',
    },
    call: {
      partner: 'maya',
      sceneZh: '账单来了，你发现自己没带钱包。',
      turns: [
        {
          line: 'What? What happened?',
          zh: '怎么了？出什么事了？',
          options: [
            { say: 'I forgot my wallet. I am so sorry.', kw: ['forgot', 'wallet', "don't have", 'left', 'no money', 'lost'], react: 'Are you serious?' },
            { say: "Oh no. I think I left my wallet at home.", kw: ['home', 'left', 'jacket'], react: 'Oh no. Are you serious?' },
          ],
          hint: { zh: '说「我忘带钱包了」', first: 'I forgot my…' },
        },
        {
          line: "It's okay. I can cover you.",
          zh: '没事，我先帮你付。',
          options: [
            { say: 'You sure? I feel like an idiot.', kw: ['sure', 'idiot', 'feel', 'really'], react: "You're not an idiot. It happens." },
            { say: "Thank you. I'll get you back tonight.", kw: ['get you back', 'pay you back', 'thank', 'tonight', 'send'], react: 'No rush.' },
          ],
          hint: { zh: '说「你确定？我觉得自己像个傻子」', first: 'You sure? I…' },
        },
        {
          line: 'Or just get the next one. No big deal.',
          zh: '或者下次你请就行。没什么大不了的。',
          options: [
            { say: "Okay. Next one's on me, for real.", kw: ['next one', 'on me', 'for real', 'okay', 'ok', 'deal', 'sure'], react: "Good. Then I'm getting the good pasta." },
            { say: "I'll still get you back tonight.", kw: ['still', 'tonight', 'back', 'send'], react: "Fine, fine. Whatever's easy." },
          ],
          hint: { zh: '说「好，下次我请，说真的」', first: "Okay. Next one's…" },
        },
        {
          line: 'Should I get dessert too, or is that too much?',
          zh: '我再点个甜点，会不会太过分？',
          options: [
            { say: 'Get the dessert. I deserve that.', kw: ['get', 'dessert', 'deserve', 'go for it', 'yes', 'sure', 'of course'], react: 'You kind of do.' },
            { say: "Ha. Get whatever you want.", kw: ['whatever', 'anything', 'want'], react: 'Oh, I will.' },
          ],
          hint: { zh: '说「点吧，我活该」', first: 'Get the…' },
        },
      ],
      bye: 'Okay. Next time is yours. Thank me later.',
    },
  },
  {
    id: 'pack01-06-next-ones-on-me',
    no: 6,
    hookZh: '说好的“下次我请”，到了。',
    gist: {
      q: '这次是谁请客？为什么？',
      options: ['Maya 请，因为上次她帮 Chris 付了', 'Chris 请，因为他过生日', '各付各的'],
      answer: 0,
    },
    lineZh: {
      l1: '别碰那个。这次我请。',
      l2: '我都没——我只是看了一眼。',
      l3: '我看到你的手了。我是认真的。',
      l4: '好吧。谢谢。要找个桌子，还是就在柜台点？',
      l5: '柜台就行。你要什么？',
      l6: '我想来杯咖啡，然后，不知道，也许那个鸡蛋三明治。',
      l7: '点三明治。我说了这次我来。',
      l8: '你每次都这么说，然后最后还是我——',
      l9: '今天不会。你忘带钱包，我帮你付了，这次就是“下次”。说好的。',
      l10: '对。说好的。谢谢你。',
      l11: '不客气。要不你帮我们俩一起点？我去拿纸巾。',
      l12: '好。你要老样子？那个燕麦什么的？',
      l13: '燕麦什么的，对。他们要是问，就说我付。你一开口就先说。',
      l14: '遵命，女士。',
      l15: '别跟我“遵命”。让我付就行。',
      l16: '会的。我连机器都不看一眼。',
      l17: '很好。我就要这个。',
    },
    call: {
      partner: 'chris',
      sceneZh: '在咖啡店柜台，这次轮到你请客。Chris 又想掏卡。',
      turns: [
        {
          line: 'Oh, I can just tap my card real quick.',
          zh: '哦，我刷一下卡就好。',
          options: [
            { say: "Don't touch that. Next one's on me.", kw: ["don't", 'next one', 'on me', 'my treat', 'i got', "i'll pay", 'no', 'stop'], react: 'I was just looking at it!' },
            { say: "No way. I'm paying today. I'm serious.", kw: ['serious', 'paying', 'today', 'no way'], react: 'Okay, okay.' },
          ],
          hint: { zh: '说「别碰，这次我请」', first: "Don't touch…" },
        },
        {
          line: 'Okay. Thank you. Table, or just the counter?',
          zh: '好吧，谢谢。找桌子，还是就在柜台？',
          options: [
            { say: "Counter's fine. What are you getting?", kw: ['counter', 'fine', 'here', 'what are you'], react: 'Maybe a coffee and that egg sandwich.' },
            { say: "Let's grab a table.", kw: ['table', 'sit', 'grab'], react: "Cool. I'll get a coffee and maybe that egg sandwich." },
          ],
          hint: { zh: '说「柜台就行，你要什么？」', first: "Counter's…" },
        },
        {
          line: "But you always say that, and then I still end up paying.",
          zh: '可你每次都这么说，最后还是我付。',
          options: [
            { say: "Not today. I covered you, this is the next one. That's the deal.", kw: ['deal', 'not today', 'covered', 'promise', 'serious'], react: "Yeah. That's the deal. I appreciate it." },
            { say: "Not today. Get the sandwich.", kw: ['sandwich', 'get', 'not today'], react: 'Okay. Thank you.' },
          ],
          hint: { zh: '说「今天不会，说好的」', first: "Not today. That's…" },
        },
        {
          line: 'Want the usual? The oat whatever?',
          zh: '你要老样子？那个燕麦什么的？',
          options: [
            { say: "Yes, the oat whatever. And tell them I'm paying.", kw: ['yes', 'yeah', 'usual', 'oat', 'paying', 'sure', 'please'], react: "Yes, ma'am." },
            { say: "Actually, I'll get a latte today.", kw: ['latte', 'actually', 'tea', 'coffee', 'americano'], react: "Got it. And you're paying. I know." },
          ],
          hint: { zh: '说「对，跟他们说我付」', first: 'Yes, the oat…' },
        },
      ],
      bye: "I won't even look at the machine. Promise.",
    },
  },
  {
    id: 'pack01-07-split-it-three-ways',
    no: 7,
    hookZh: '三个人吃完饭，账怎么分？',
    gist: {
      q: '最后大概是怎么分的？',
      options: ['Chris 付酒水，其他平分', '三个人全部平分', 'Jordan 一个人请客'],
      answer: 0,
    },
    lineZh: {
      l1: '好，怎么弄？要不就三个人平分？',
      l2: '简单。我没问题。',
      l3: '嗯，不过酒水是我点的。要不你们俩分饭钱，我……酒水我自己出？',
      l4: '或者我多出一点，咱们别搞什么表格了。',
      l5: '拜托别搞表格。',
      l6: '我没要搞表格。我只是说酒水大概四十。',
      l7: '四十？我们喝了四十块的酒？',
      l8: '你喝了两杯。Maya 一杯。我喝了，呃，比那多。',
      l9: '那酒水你付，剩下的我们分？可以。',
      l10: '酒水我也可以出一点。我不想让你一个人扛。',
      l11: '真的没事。酒水我来了。你确定要出钱？',
      l12: '我出十块，就这样定了。我不想在餐厅里跟你争。',
      l13: '你好成熟哦。',
      l14: '我是累了。那不一样。',
      l15: '好。十块可以。我转给你……等等，不对，你转我十块，我已经刷卡了。',
      l16: '好。马上转。Maya，你把你那三分之一的饭钱转给他？',
      l17: '已经在转了。',
    },
    call: {
      partner: 'jordan',
      sceneZh: '和 Jordan、Maya 吃完饭。酒水是你点的。',
      turns: [
        {
          line: "Okay, what's the move? Wanna just split it three ways?",
          zh: '好，怎么弄？要不就三个人平分？',
          options: [
            { say: 'Sure, except I got the drinks.', kw: ['drinks', 'except', 'i got'], react: 'Oh, right. The drinks.' },
            { say: "Yeah, let's split it three ways.", kw: ['three ways', 'split', 'sure', 'yeah', 'okay', 'ok', 'easy'], react: 'Easy. Wait, what about the drinks?' },
          ],
          hint: { zh: '说「可以，不过酒水是我点的」', first: 'Sure, except I…' },
        },
        {
          line: 'How much were the drinks?',
          zh: '酒水多少钱？',
          options: [
            { say: 'Like forty, I think.', kw: ['forty', '40', 'like', 'think', 'dollars', 'bucks', 'about'], react: 'Forty? Did we drink forty dollars of drinks?' },
            { say: "I don't know. Not much. Let's not do a spreadsheet.", kw: ['spreadsheet', "don't know", 'not much', 'whatever'], react: 'Please, no spreadsheet.' },
          ],
          hint: { zh: '说「大概四十吧」', first: 'Like…' },
        },
        {
          line: 'I can throw in ten bucks and we call it done.',
          zh: '我出十块，就这样定了。',
          options: [
            { say: "Okay. Ten's fine. Send it to me, I already put my card down.", kw: ['ten', 'fine', 'okay', 'ok', 'send', 'card', 'deal', 'sure'], react: 'Yep. Doing it now.' },
            { say: "You sure? I can just keep the drinks.", kw: ['sure', 'keep', "it's fine", 'really', 'no need'], react: "I'm not gonna fight you in a restaurant. Ten bucks." },
          ],
          hint: { zh: '说「好，十块可以」', first: "Okay. Ten's…" },
        },
        {
          line: 'And Maya just sends you her third of the food?',
          zh: '那 Maya 把她那三分之一的饭钱转给你？',
          options: [
            { say: "Yeah, that works. Thanks, guys.", kw: ['yeah', 'yes', 'works', 'thanks', 'good', 'perfect', 'sure', 'okay', 'ok'], react: "She's already on it." },
            { say: 'Perfect. We good?', kw: ['perfect', 'we good', 'done'], react: "We're good." },
          ],
          hint: { zh: '说「好，就这么办」', first: 'Yeah, that…' },
        },
      ],
      bye: "Very grown-up of us. Okay, I'm going home to sleep.",
    },
  },
];

export function episodeById(id: string): EpisodeMeta | undefined {
  return EPISODES.find((e) => e.id === id);
}
