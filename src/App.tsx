import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const SX_GOODS_CHANNEL_URL = 'https://mt.avito.ru/avito/channels/sx-goods-public'
const GOODS_MASK_URL = new URL('../Mask group.svg', import.meta.url).href

const keepShortWords = (text: string) => {
  const shortWords =
    'а|в|во|и|к|ко|о|об|от|до|за|из|на|по|но|не|ни|же|ли|бы|с|со|у|для|без|при|под|над|про|как|что|или|если|перед|после|через|между|вместо|внутри|вне|около|SX'
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${shortWords})[ \\t\\r\\n\\f]+`,
    'giu',
  )
  return text.replace(pattern, (match) =>
    match.replace(/[ \t\r\n\f]+$/, '\u00A0'),
  )
}

type ScreenDecision = 'no' | 'temporary' | 'replacement' | 'new'

type Criterion = {
  id: string
  label: string
  group: string
}

type GoodsPoint = {
  x: number
  y: number
  inGoods: boolean
}

function GoodsShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const hero = canvas.closest<HTMLElement>('.hero')
    const context = canvas.getContext('2d')
    const maskCanvas = document.createElement('canvas')
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
    const image = new Image()
    const pointer = { x: 0, y: 0, effectX: 0, effectY: 0, active: false, level: 0 }
    let animationFrame = 0
    let points: GoodsPoint[] = []
    let maskData: ImageData | null = null
    let width = 0
    let height = 0
    let dpr = 1

    if (!hero || !context || !maskContext) {
      return
    }

    const setPointer = (event: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = (event.clientX - rect.left) * (width / rect.width)
      pointer.y = (event.clientY - rect.top) * (height / rect.height)
      pointer.active = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom
    }

    const hidePointer = () => {
      pointer.active = false
    }

    const rebuildPoints = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      maskCanvas.width = width
      maskCanvas.height = height
      maskContext.clearRect(0, 0, width, height)

      const imageRatio = image.naturalWidth / image.naturalHeight
      const markScale = width > 900 ? 1.017 : 1.384
      const drawWidth = width * markScale
      const drawHeight = drawWidth / imageRatio
      const drawX = (width - drawWidth) / 2
      const drawY = width > 900 ? -height * 0.23 : height * 0.06

      maskContext.drawImage(image, drawX, drawY, drawWidth, drawHeight)
      maskData = maskContext.getImageData(0, 0, width, height)
      points = []

      const step = width > 900 ? 14 : 12
      const gridOffset = step / 2
      const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor
      // Якорим canvas-точки к координатам страницы, а не к самому canvas.
      // Так их фаза совпадает со статичной сеткой за пределами hero.
      const startX = modulo(gridOffset - rect.left, step)
      const startY = modulo(gridOffset - rect.top, step)

      for (let y = startY; y < height; y += step) {
        for (let x = startX; x < width; x += step) {
          const sampleX = Math.max(0, Math.min(width - 1, Math.round(x)))
          const sampleY = Math.max(0, Math.min(height - 1, Math.round(y)))
          const alpha = maskData.data[(sampleY * width + sampleX) * 4 + 3]

          points.push({ x, y, inGoods: alpha > 32 })
        }
      }
    }

    const draw = (time = 0) => {
      const isPointerInCanvas = pointer.active
        && pointer.x >= 0
        && pointer.x <= width
        && pointer.y >= 0
        && pointer.y <= height

      if (isPointerInCanvas) {
        pointer.effectX = pointer.x
        pointer.effectY = pointer.y
      }

      const targetLevel = isPointerInCanvas ? 1 : 0

      pointer.level += (targetLevel - pointer.level) * 0.1

      context.clearRect(0, 0, width, height)

      const radius = width > 900 ? 190 : 138
      const baseDotSize = width > 900 ? 1.45 : 1.25
      const goodsDotSize = width > 900 ? 2.66 : 2.05

      context.globalAlpha = 1

      for (const point of points) {
        let x = point.x
        let y = point.y
        let proximity = 0
        const bottomFadeProgress = Math.max(0, Math.min(1, (height - point.y) / 120))
        const bottomFade = bottomFadeProgress * bottomFadeProgress * (3 - 2 * bottomFadeProgress)
        const interactionLevel = pointer.level * bottomFade
        const deltaX = point.x - pointer.effectX
        const deltaY = point.y - pointer.effectY
        const distanceToCursor = Math.hypot(deltaX, deltaY)

        if (distanceToCursor < radius && distanceToCursor > 0.01) {
          proximity = 1 - distanceToCursor / radius
          const localStrength = point.inGoods ? 0.3 : 0.06
          const compression = interactionLevel * localStrength * proximity * proximity

          x = pointer.effectX + deltaX * (1 - compression)
          y = pointer.effectY + deltaY * (1 - compression)
        }

        const attraction = interactionLevel * proximity * proximity
        let dotSize: number

        if (point.inGoods) {
          const reveal = attraction
          const pulseWave = (Math.sin(time * 0.0045 + point.x * 0.018 + point.y * 0.012) + 1) / 2
          const pulseActivation = width <= 900
            ? 0.5 + pointer.level * proximity * 0.45
            : 0.28 + pointer.level * proximity * 0.55
          const pulseOffset = (pulseWave - 0.5) * 16 * pulseActivation
          const red = Math.round(132 + 68 * reveal + pulseOffset)
          const green = Math.round(129 + 65 * reveal + pulseOffset)
          const blue = Math.round(122 + 60 * reveal + pulseOffset)

          context.fillStyle = `rgb(${red}, ${green}, ${blue})`
          dotSize = goodsDotSize * (1 + 0.1 * pulseWave * pulseActivation)
        } else {
          const red = Math.round(32 + 95 * attraction)
          const green = Math.round(31 + 92 * attraction)
          const blue = Math.round(29 + 87 * attraction)

          context.fillStyle = `rgb(${red}, ${green}, ${blue})`
          dotSize = baseDotSize + (goodsDotSize - baseDotSize) * attraction
        }
        context.beginPath()
        context.arc(x, y, dotSize, 0, Math.PI * 2)
        context.fill()
      }

      context.globalAlpha = 1
      animationFrame = requestAnimationFrame(draw)
    }

    image.onload = () => {
      rebuildPoints()
      animationFrame = requestAnimationFrame(draw)
    }

    image.src = GOODS_MASK_URL

    const resizeObserver = new ResizeObserver(() => {
      if (image.complete) {
        rebuildPoints()
      }
    })

    resizeObserver.observe(canvas)
    window.addEventListener('pointermove', setPointer)
    window.addEventListener('mousemove', setPointer)
    window.addEventListener('blur', hidePointer)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', setPointer)
      window.removeEventListener('mousemove', setPointer)
      window.removeEventListener('blur', hidePointer)
    }
  }, [])

  return <canvas className="goodsMark" aria-hidden="true" ref={canvasRef} />
}

const principles = [
  {
    titleLines: ['Решаем задачу пользователя,', 'а не собираем данные'],
    text: 'Каждый шаг должен быть связан с пользой для продажи. Поля и действия без влияния на результат нужно убирать.',
  },
  {
    titleLines: ['Система заполняет сама,', 'пользователь подтверждает'],
    text: 'Если данные можно взять из фото, прошлого объявления, профиля, категории, адресов, распознавания или шаблонов, сначала проверяем автозаполнение, подсказку или подтверждение вместо ручного ввода.',
  },
  {
    titleLines: ['Минимизируем энергозатраты', 'вместо экранов'],
    text: 'Важно снижать не только количество экранов, но и количество решений. Используем дефолты, рекомендации, превью и явную связь «действие → результат».',
  },
  {
    titleLines: ['Сначала достаточно,', 'потом идеально'],
    text: 'Сначала помогаем опубликовать достаточно хорошее объявление, потом — улучшать его. Улучшения, платные и дополнительные опции не должны блокировать завершение подачи.',
  },
  {
    titleLines: ['Пользователь понимает,', 'что осталось сделать'],
    text: 'Показываем прогресс, оставшиеся шаги и причину обязательных действий. Неожиданные этапы в конце подачи снижают завершение флоу.',
  },
  {
    titleLines: ['Интерфейс учитывает опыт', 'и контекст пользователя'],
    text: 'Новичку нужна поддержка, опытному продавцу — скорость. Не заставляем опытных пользователей проходить обучение и не перегружаем новичков лишними решениями.',
  },
]

const criteria: Criterion[] = [
  {
    id: 'step-order',
    label: 'Меняется порядок шагов в подаче',
    group: 'Экраны и шаги',
  },
  {
    id: 'split-merge-steps',
    label: 'Один шаг делится на несколько или несколько шагов объединяются',
    group: 'Экраны и шаги',
  },
  {
    id: 'new-field',
    label: 'Появляется новое поле или параметр',
    group: 'Поля, параметры и зависимости',
  },
  {
    id: 'parameter-validation',
    label: 'Появляется новая зависимость между параметрами с валидацией',
    group: 'Поля, параметры и зависимости',
  },
  {
    id: 'new-component',
    label: 'Нужен новый компонент',
    group: 'Компоненты и интерфейс',
  },
  {
    id: 'component-update',
    label: 'Нужно доработать существующий компонент',
    group: 'Компоненты и интерфейс',
  },
  {
    id: 'outside-system',
    label: 'Решение выходит за текущие гайдлайны, сильно выделяется или ломает привычный паттерн',
    group: 'Компоненты и интерфейс',
  },
  {
    id: 'reusable-interaction',
    label: 'Появляется новый способ взаимодействия: например, массовое редактирование, выбор параметров или подтверждение данных',
    group: 'Компоненты и интерфейс',
  },
  {
    id: 'multi-category',
    label: 'Изменение касается нескольких категорий',
    group: 'Категории, платформы и команды',
  },
  {
    id: 'platform-diff',
    label: 'Поведение отличается на iOS, Android, Web или MAV',
    group: 'Категории, платформы и команды',
  },
  {
    id: 'hard-disable',
    label: 'Для запуска или отключения нужно участие нескольких команд',
    group: 'Категории, платформы и команды',
  },
  {
    id: 'sensitive',
    label: 'Изменение связано с безопасностью, приватностью или модерацией',
    group: 'Категории, платформы и команды',
  },
]

const screenDecisionLabels: Record<ScreenDecision, string> = {
  no: 'Нет, новый экран не нужен',
  temporary:
    'Экран появляется один раз или временно: например, онбординг, fake door, промо или разовое подтверждение',
  replacement: 'Один экран меняется на другой',
  new: 'Добавляется новый постоянный экран',
}

const criteriaSections = [
  {
    title: 'Экраны и шаги',
    description: 'Порядок, разделение и объединение этапов подачи.',
    ids: ['step-order', 'split-merge-steps'],
  },
  {
    title: 'Поля, параметры и зависимости',
    description: 'Новые данные в подаче и связи между ними.',
    ids: ['new-field', 'parameter-validation'],
  },
  {
    title: 'Компоненты и интерфейс',
    description: 'Новые и доработанные компоненты, дизайн-система и повторяемые паттерны.',
    ids: ['new-component', 'component-update', 'outside-system', 'reusable-interaction'],
  },
  {
    title: 'Категории, платформы и команды',
    description: 'Несколько категорий, платформенные отличия, зависимые команды и чувствительные зоны.',
    ids: ['multi-category', 'platform-diff', 'hard-disable', 'sensitive'],
  },
]

const rethinkCases = [
  'Новый постоянный экран выбран первым решением, а существующие шаги и компоненты ещё не проверены.',
  'Решение добавляет шаги или решения для пользователя, но польза для продавца и бизнеса пока не подтверждена.',
]

const noMessageCases = [
  'Меняется только текст или иллюстрация без изменения смысла и поведения.',
  'Меняется отступ или расположение необязательного элемента.',
  'Используется готовый компонент без доработки и изменения сценария.',
  'Исправляется локальная визуальная ошибка, которая не влияет на другие категории или платформы.',
]

const revokeReasons = [
  'пользователь не может закончить подачу или теряет данные',
  'возникает непреднамеренное платное действие или раскрытие данных',
  'нарушены требования безопасности, приватности или модерации',
  'фича вышла за заявленную аудиторию или платформу',
  'сломаны правила публикации, черновика, модерации или передачи данных',
  'в подаче появились новые экраны, которые не обсуждались до запуска',
  'статистически значимо выросло время прохождения подачи',
]

function App() {
  const [screenDecision, setScreenDecision] = useState<ScreenDecision>('no')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [openPrinciple, setOpenPrinciple] = useState<string | null>(null)
  const [openCriteriaSections, setOpenCriteriaSections] = useState<string[]>(
    criteriaSections[0]?.title ? [criteriaSections[0].title] : [],
  )

  const selectedCriteria = useMemo(
    () => criteria.filter((criterion) => selectedIds.includes(criterion.id)),
    [selectedIds],
  )

  const screenDecisionCopy: Record<ScreenDecision, string> = {
    no: 'не нужен',
    temporary:
      'появляется один раз или временно: онбординг, fake door, промо или разовое подтверждение',
    replacement: 'один экран меняется на другой',
    new: 'добавляется новый постоянный экран',
  }

  const summaryText = [
    'Задача / что меняем: [ссылка на задачу или краткое описание изменения]',
    'Платформа: [iOS / Android / Web / MAV]',
    'Ссылка на макеты (as is и наброски, если есть): [вставьте ссылку]',
    'Подтверждающие данные: [ссылка или «данных пока нет»]',
    '',
    `Новый экран: ${screenDecisionCopy[screenDecision]}`,
    '',
    'Что меняется в подаче:',
    ...(selectedCriteria.length
      ? selectedCriteria.map((criterion) => `— ${criterion.label}`)
      : ['— дополнительные изменения не отмечены']),
  ].join('\n')

  const toggleCriterion = (id: string) => {
    setCopied(false)
    setSelectedIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    )
  }

  const updateScreenDecision = (decision: ScreenDecision) => {
    setCopied(false)
    setScreenDecision(decision)
  }

  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryText)
    setCopied(true)
  }

  return (
    <main className="page">
      <section className="hero">
        <GoodsShader />
        <div className="hero__content glowTarget">
          <h1>
            <span>Подготовьте изменение</span>
            <span>в&nbsp;подаче к&nbsp;обсуждению</span>
          </h1>
          <p className="lead">
            {keepShortWords(
              'Для команд Goods, которые обновляют подачу объявления. Здесь можно свериться с общими принципами, понять, когда написать SX Goods, и за пару минут собрать готовое сообщение в канал.',
            )}
          </p>
          <div className="hero__actions">
            <a className="button button_primary glowTarget" href="#message-builder">
              {keepShortWords('Собрать сообщение')}
            </a>
          </div>
        </div>
      </section>

      <section className="section principlesSection glowTarget">
        <div className="section__heading">
          <p className="eyebrow">Раздел 1</p>
          <h2>{keepShortWords('Основные принципы подачи')}</h2>
          <p>
            {keepShortWords(
              'Они помогают собирать изменения в общий сценарий, а не в набор локальных решений. Используйте как быстрый фильтр: не добавляет ли фича лишний экран, ручной ввод или непонятный выбор для продавца.',
            )}
          </p>
        </div>
        <div className="principles">
          {principles.map((principle) => {
            const id = principle.titleLines.join(' ')
            const isOpen = openPrinciple === id

            return (
              <article
                className={`principle glowTarget${isOpen ? ' principle_open' : ''}`}
                key={id}
              >
                <button
                  aria-expanded={isOpen}
                  className="principle__summary"
                  type="button"
                  onClick={() => setOpenPrinciple((current) => (current === id ? null : id))}
                >
                <span>
                  {principle.titleLines.map((line) => (
                    <span className="principle__titleLine" key={line}>
                      {keepShortWords(line)}
                    </span>
                  ))}
                </span>
                </button>
                <p className="principle__text">{keepShortWords(principle.text)}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section guidanceSection glowTarget" id="before-message">
        <div className="section__heading">
          <p className="eyebrow">Перед сообщением</p>
          <h2>{keepShortWords('Сначала проверьте два исключения')}</h2>
          <p>
            {keepShortWords(
              'Они помогают не тратить время на оформление запроса, если решение ещё рано обсуждать или изменение не затрагивает общий сценарий подачи.',
            )}
          </p>
        </div>

        <div className="guidanceGrid">
          <article className="guidanceCard guidanceCard_rethink">
            <h3>{keepShortWords('Когда решение стоит сначала переосмыслить')}</h3>
            <p>
              {keepShortWords(
                'Не обязательно делать это в одиночку: можно прийти в SX Goods за помощью с вариантами решения.',
              )}
            </p>
            <ul>
              {rethinkCases.map((item) => (
                <li key={item}>{keepShortWords(item)}</li>
              ))}
            </ul>
          </article>

          <article className="guidanceCard guidanceCard_skip">
            <h3>{keepShortWords('Когда SX Goods можно не писать')}</h3>
            <p>
              {keepShortWords(
                'Если изменение не меняет поля, шаги, компоненты или поведение подачи и подходит под один из примеров ниже.',
              )}
            </p>
            <ul>
              {noMessageCases.map((item) => (
                <li key={item}>{keepShortWords(item)}</li>
              ))}
            </ul>
          </article>
        </div>

        <div className="guidanceNext">
          <p>
            {keepShortWords(
              'Во всех остальных случаях отметьте изменения в чек-листе — он соберёт короткий шаблон сообщения для канала SX Goods.',
            )}
          </p>
          <a className="button button_primary" href="#message-builder">
            {keepShortWords('Перейти к шаблону')}
          </a>
        </div>
      </section>

      <section className="section quiz glowTarget" id="message-builder">
        <div className="section__heading">
          <p className="eyebrow">Шаблон сообщения</p>
          <h2>{keepShortWords('Соберите сообщение для SX Goods')}</h2>
          <p>
            {keepShortWords(
              'Это не квиз и не проверка решения. Отметьте факты об изменении — выбранные пункты автоматически попадут в короткий шаблон для канала.',
            )}
          </p>
        </div>

        <div className="quiz__layout">
          <div className="quiz__form">
            <fieldset className="panel">
              <legend>{keepShortWords('1. Что происходит с экранами?')}</legend>
              <div className="screenOptions">
                {Object.entries(screenDecisionLabels).map(([decision, label]) => (
                  <label
                    className={
                      screenDecision === decision
                        ? 'screenOption screenOption_active glowTarget'
                        : 'screenOption glowTarget'
                    }
                    key={decision}
                  >
                    <input
                      checked={screenDecision === decision}
                      name="screenDecision"
                      type="radio"
                      value={decision}
                      onChange={() =>
                        updateScreenDecision(decision as ScreenDecision)
                      }
                    />
                    <span>{keepShortWords(label)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="panel panel_criteria">
              <legend>{keepShortWords('2. Что ещё меняется в подаче?')}</legend>
              <div className="criteriaSections">
                {criteriaSections.map((section, index) => (
                  <div
                    className={
                      openCriteriaSections.includes(section.title)
                        ? 'criteriaSection criteriaSection_open'
                        : 'criteriaSection'
                    }
                    key={section.title}
                  >
                    <button
                      aria-controls={`criteria-section-${index}`}
                      aria-expanded={openCriteriaSections.includes(
                        section.title,
                      )}
                      className="criteriaSection__heading"
                      type="button"
                      onClick={() =>
                        setOpenCriteriaSections((currentSections) =>
                          currentSections.includes(section.title)
                            ? currentSections.filter(
                                (title) => title !== section.title,
                              )
                            : [...currentSections, section.title],
                        )
                      }
                    >
                      <span className="criteriaSection__headingCopy">
                        <h3>{keepShortWords(section.title)}</h3>
                        <span className="criteriaSection__description">
                          {keepShortWords(section.description)}
                        </span>
                      </span>
                      <span className="criteriaSection__icon" aria-hidden="true" />
                    </button>
                    <div
                      className="criteriaSection__panel"
                      id={`criteria-section-${index}`}
                    >
                      <div className="criteriaSection__panelInner">
                        <div className="criteriaSection__items">
                          {section.ids.map((id) => {
                            const criterion = criteria.find(
                              (item) => item.id === id,
                            )

                            if (!criterion) {
                              return null
                            }

                            return (
                              <label
                                className="check glowTarget"
                                key={criterion.id}
                              >
                                <input
                                  checked={selectedIds.includes(criterion.id)}
                                  type="checkbox"
                                  onChange={() => toggleCriterion(criterion.id)}
                                />
                                <span>{keepShortWords(criterion.label)}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          </div>

          <aside className="result messagePanel glowTarget">
            <p className="eyebrow">Готовое сообщение</p>
            <h2 className="messagePanel__title">
              Шаблон для
              <br />
              канала SX&nbsp;Goods
            </h2>
            <p className="resultNote">
              {keepShortWords(
                'Выбранные пункты уже добавлены. После копирования останется вставить ссылки и коротко описать изменение.',
              )}
            </p>
            <a className="result__revokeLink" href="#revoke">
              {keepShortWords('После запуска: когда SX Goods может остановить изменение')}
            </a>

            <h3>{keepShortWords('В шаблоне будет')}</h3>
            <ul className="messagePanel__contents">
              <li>{keepShortWords('задача или краткое описание изменения')}</li>
              <li>{keepShortWords('платформа')}</li>
              <li>{keepShortWords('одна ссылка на as is и наброски, если есть')}</li>
              <li>{keepShortWords('подтверждающие данные или отметка, что их пока нет')}</li>
            </ul>

            <div className="result__actions">
              <button
                className="button button_primary messagePanel__copy glowTarget"
                onClick={copySummary}
              >
                {keepShortWords(
                  copied ? 'Шаблон скопирован' : 'Скопировать шаблон',
                )}
              </button>
              <a
                className="button button_secondary glowTarget"
                href={SX_GOODS_CHANNEL_URL}
                rel="noreferrer"
                target="_blank"
              >
                {keepShortWords('Перейти в канал SX Goods')}
              </a>
            </div>
          </aside>
        </div>
      </section>

      <section className="section revokeSection glowTarget" id="revoke">
        <div className="section__heading">
          <p className="eyebrow">Важно</p>
          <h2>{keepShortWords('Когда SX Goods может остановить уже запущенное изменение')}</h2>
          <p>
            {keepShortWords(
              'Это не запасной путь вместо обсуждения. Если изменение затрагивает общий сценарий подачи, команда приходит в SX Goods до разработки или запуска. Если обновление запустили без обсуждения или после запуска появился риск для подачи, SX Goods может попросить остановить тест, откатить или отключить изменение.',
            )}
          </p>
        </div>

        <ul className="revokeList">
          {revokeReasons.map((reason) => (
            <li key={reason}>
              <span className="revokeList__icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75" />
                  <path d="M5.25 8h5.5" />
                </svg>
              </span>
              {keepShortWords(reason)}
            </li>
          ))}
        </ul>
      </section>

    </main>
  )
}

export default App
