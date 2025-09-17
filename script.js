import { ImageSegmenter, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/vision_bundle.js";
document.addEventListener('DOMContentLoaded', () => {
    // === CONSTANTES E VARIÁVEIS GLOBAIS ===
    const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbx1l6QuqWnD4fg0XcUyGlGxnBpItqX5-Uw_fBhk9ov1SvuFTfDrY1Ok2YNlUwqC8wNdig/exec';
    const CLOUDINARY_CLOUD_NAME = 'dh8hpjwlc';
    const CLOUDINARY_UPLOAD_PRESET = 'my-carousel-preset';

    let allRoteiros = [];
    let themeRoteiros = [];
    let shouldRemoveBackground = false; 

    let currentSlideIndex = 0;
    let activeElement = null;
    let elementCounter = 0;
    let isPanning = false;

    // Variáveis para Zoom e Pan
    let currentScale = 1;
    let slidePosX = 0;
    let slidePosY = 0;

    // --- NOVO: Variáveis para o Histórico (Undo/Redo) ---
    let history = [];
    let historyIndex = -1;
    const MAX_HISTORY_STATES = 50; // Limite de ações no histórico

    const watermarkData = { clara: 'https://i.imgur.com/aRMubKX.png', escura: 'https://i.imgur.com/1jWGIzV.png' };
    const colors = { terracota: '#C36640', lightGray: '#F4F4F4', black: '#000000' };

    // === ELEMENTOS DO DOM ===
    const slideContainer = document.getElementById('slideContainer');
    const introScreen = document.getElementById('intro-screen');
    const introThemeDropdown = document.getElementById('introThemeDropdown');
    const introCarouselDropdown = document.getElementById('introCarouselDropdown');
    const confirmBtn = document.getElementById('confirmBtn');
    const topBarsWrapper = document.querySelector('.top-bars-wrapper');
    const mainElement = document.querySelector('main');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const slideCounter = document.getElementById('slideCounter');
    const themeDropdown = document.getElementById('themeDropdown');
    const carouselDropdown = document.getElementById('carouselDropdown');
    const boldBtn = document.getElementById('boldBtn');
    const italicBtn = document.getElementById('italicBtn');
    const underlineBtn = document.getElementById('underlineBtn');
    const leftAlignBtn = document.getElementById('leftAlignBtn');
    const centerAlignBtn = document.getElementById('centerAlignBtn');
    const rightAlignBtn = document.getElementById('rightAlignBtn');
    const justifyBtn = document.getElementById('justifyBtn');
    const lineHeightSelect = document.getElementById('lineHeightSelect');
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const textColorPicker = document.getElementById('textColorPicker');
    const bringToFrontBtn = document.getElementById('bringToFrontBtn');
    const sendToBackBtn = document.getElementById('sendToBackBtn');
    const opacitySlider = document.getElementById('opacitySlider');
    const deleteBtn = document.getElementById('deleteBtn');
    const colorPicker = document.getElementById('colorPicker');
    const exportPngBtn = document.getElementById('exportPngBtn');
    const imageUpload = document.getElementById('imageUpload');
    const addSlideBtn = document.getElementById('addSlideBtn');
    const removeSlideBtn = document.getElementById('removeSlideBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const saveBtn = document.getElementById('saveBtn');
    const addTextBtn = document.getElementById('addTextBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');

    // === FUNÇÕES DE HISTÓRICO (UNDO/REDO) ===
    function saveState() {
        const elementsData = [];
        slideContainer.querySelectorAll('.draggable-item').forEach(el => elementsData.push(getElementState(el)));
        const currentState = {
            elements: elementsData,
            backgroundColor: slideContainer.style.backgroundColor
        };
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(JSON.stringify(currentState));
        if (history.length > MAX_HISTORY_STATES) {
            history.shift();
        }
        historyIndex = history.length - 1;
    }

    function loadStateFromHistory(stateString) {
        if (!stateString) return;
        const state = JSON.parse(stateString);
        slideContainer.innerHTML = '';
        const snapLinesHTML = `<div class="snap-line-v" id="snap-v-25"></div><div class="snap-line-v" id="snap-v-50"></div><div class="snap-line-v" id="snap-v-75"></div><div class="snap-line-h" id="snap-h-25"></div><div class="snap-line-h" id="snap-h-50"></div><div class="snap-line-h" id="snap-h-75"></div>`;
        slideContainer.innerHTML = snapLinesHTML;
        slideContainer.style.backgroundColor = state.backgroundColor;
        loadState(state.elements);
        updateWatermark();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            loadStateFromHistory(history[historyIndex]);
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            loadStateFromHistory(history[historyIndex]);
        }
    }

    // === FUNÇÕES DE COPIAR/COLAR UNIFICADO ===
    function getElementState(element) {
        if (!element) return null;
        const isText = element.classList.contains('is-text');
        const type = isText ? 'text' : (element.classList.contains('is-watermark') ? 'watermark' : 'image');
        const state = {
            type: type,
            id: element.id,
            x: parseFloat(element.getAttribute('data-x')) || 0,
            y: parseFloat(element.getAttribute('data-y')) || 0,
            angle: parseFloat(element.getAttribute('data-angle')) || 0,
            width: element.style.width,
            height: element.style.height,
            content: isText ? element.innerHTML : element.querySelector('img').src,
            style: element.style.cssText
        };
        if (type === 'image') state.ratio = element.getAttribute('data-ratio');
        return state;
    }

    function createElementFromState(state) {
        let el;
        if (state.type === 'text') {
            el = document.createElement('div');
            el.innerHTML = state.content;
            el.setAttribute('contenteditable', 'true');
        } else {
            el = document.createElement('div');
            const img = document.createElement('img');
            img.src = state.content;
            el.appendChild(img);
            if (state.type === 'image') {
                const handle = document.createElement('div');
                handle.className = 'rotation-handle';
                el.appendChild(handle);
            }
        }
        el.id = state.id || `element-${elementCounter++}`;
        el.className = `draggable-item ${state.type === 'text' ? 'is-text' : (state.type === 'watermark' ? 'is-watermark' : 'is-image')}`;
        el.style.cssText = state.style;
        el.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.angle}deg)`;
        el.setAttribute('data-x', state.x);
        el.setAttribute('data-y', state.y);
        el.setAttribute('data-angle', state.angle);
        if (state.type === 'image' && state.ratio) el.setAttribute('data-ratio', state.ratio);
        slideContainer.appendChild(el);
        makeInteractive(el);
        return el;
    }

    // --- INÍCIO DAS MODIFICAÇÕES NO CLIPBOARD ---

    /**
     * CENÁRIOS 3, 4 (parte de cópia) e 5 (cópia)
     * Gerencia o que acontece quando o usuário pressiona Ctrl+C.
     * Distingue entre copiar uma seleção de texto e copiar um elemento inteiro.
     */
    async function handleCopy(event) {
        const selection = window.getSelection();
        const isTextSelected = selection && selection.toString().trim().length > 0;

        // Se há texto selecionado dentro de um elemento editável, permite a cópia padrão do navegador.
        if (isTextSelected) {
             // Deixa o navegador copiar o texto selecionado para o clipboard do sistema.
            return;
        }

        // Se não há texto selecionado, mas um elemento está ativo (cenário 5).
        if (activeElement) {
            event.preventDefault(); // Impede a ação padrão para copiar o elemento inteiro.
            const state = getElementState(activeElement);
            if (state) {
                // Salva o estado do elemento em um clipboard interno (sessionStorage).
                const clipboardData = { type: 'MyEditorClipboardData', data: state };
                sessionStorage.setItem('myEditorClipboard', JSON.stringify(clipboardData));
            }
        }
    }

    /**
     * CENÁRIOS 1, 2, 3, 4 e 5 (parte de colar)
     * Gerencia o que acontece quando o usuário pressiona Ctrl+V.
     * Distingue entre colar texto dentro de um elemento ou criar um novo elemento.
     */
    async function handlePasteFromEvent(event) {
        // CENÁRIO: Colar DENTRO de um bloco de texto existente.
        if (document.activeElement && document.activeElement.isContentEditable) {
            // Impede a ação padrão do navegador para controlar a colagem.
            event.preventDefault();
            // Pega o conteúdo do clipboard como TEXTO PURO.
            const text = (event.clipboardData || window.clipboardData).getData('text/plain');
            // Insere o texto puro na posição do cursor, sem trazer nenhum estilo junto.
            if (text) {
                document.execCommand('insertText', false, text);
            }
            return; // Encerra a função aqui, pois o caso já foi tratado.
        }

        // Se o código chegou até aqui, a colagem não é dentro de uma caixa de texto.
        // Impede a ação padrão para poder criar um novo elemento (imagem ou texto).
        event.preventDefault();

        // Tenta colar o elemento inteiro do nosso clipboard interno primeiro (CENÁRIO 5).
        const internalClipboardData = sessionStorage.getItem('myEditorClipboard');
        if (internalClipboardData) {
            try {
                const clipboardContent = JSON.parse(internalClipboardData);
                if (clipboardContent && clipboardContent.type === 'MyEditorClipboardData') {
                    const state = clipboardContent.data;
                    state.id = `element-${elementCounter++}`; // Novo ID
                    state.x += 20; // Desloca para não sobrepor
                    state.y += 20;

                    // Remove a propriedade de cor de fundo para o caso de colar o elemento inteiro.
                    if (state.style) {
                        state.style = state.style.replace(/background-color:\s*[^;]+;?\s*/, '');
                    }

                    const newElement = createElementFromState(state);
                    setActiveElement({ currentTarget: newElement });
                    saveState();
                    sessionStorage.removeItem('myEditorClipboard'); // Limpa após o uso
                    return;
                }
            } catch (e) {
                console.error("Falha ao colar do clipboard interno.", e);
            }
        }

        const clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        // Lógica para colar IMAGENS (funcionalidade mantida)
        const items = clipboardData.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        await pasteImage(file);
                        return;
                    }
                }
            }
        }
        
        // CENÁRIO: Colar texto do clipboard do sistema para criar um NOVO bloco de texto.
        const text = clipboardData.getData('text/plain');
        if (text && text.trim().length > 0) {
            pasteText(text);
        }
    }
    
    // --- FIM DAS MODIFICAÇÕES NO CLIPBOARD ---


    async function pasteImage(file) {
        const cloudinaryUrl = await uploadImageToCloudinary(file);
        if (!cloudinaryUrl) return;

        const tempImg = new Image();
        tempImg.onload = () => {
            const ratio = tempImg.naturalWidth / tempImg.naturalHeight;
            const initialWidth = 150;
            const imgContainer = document.createElement('div');
            imgContainer.id = `element-${elementCounter++}`;
            imgContainer.className = 'draggable-item is-image';

            const img = document.createElement('img');
            img.src = cloudinaryUrl;
            imgContainer.appendChild(img);

            const handle = document.createElement('div');
            handle.className = 'rotation-handle';
            imgContainer.appendChild(handle);

            imgContainer.style.width = initialWidth + 'px';
            imgContainer.style.height = (initialWidth / ratio) + 'px';
            imgContainer.setAttribute('data-ratio', ratio);
            imgContainer.setAttribute('data-x', '50');
            imgContainer.setAttribute('data-y', '50');
            imgContainer.style.transform = 'translate(50px, 50px)';

            slideContainer.appendChild(imgContainer);
            makeInteractive(imgContainer);
            setActiveElement({ currentTarget: imgContainer });
            saveState();
        };
        tempImg.src = cloudinaryUrl;
    }

    function pasteText(text) {
        const newText = document.createElement('div');
        newText.id = `element-${elementCounter++}`;
        newText.className = 'draggable-item is-text';
        newText.setAttribute('contenteditable', 'true');
        newText.innerHTML = text.replace(/\n/g, '<br>');
        newText.style.width = '280px';
        newText.style.height = 'auto';
        newText.style.fontFamily = 'Aguila';
        newText.style.fontSize = '16px';

        const posX = 20, posY = 50;
        newText.setAttribute('data-x', posX);
        newText.setAttribute('data-y', posY);
        newText.style.transform = `translate(${posX}px, ${posY}px)`;

        slideContainer.appendChild(newText);
        makeInteractive(newText);
        setActiveElement({ currentTarget: newText });
        saveState();
    }

    // === FUNÇÕES AUXILIARES ===
    function updateSlideTransform() {
        slideContainer.style.transform = `translate(${slidePosX}px, ${slidePosY}px) scale(${currentScale})`;
    }

    function rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return rgb;
        let sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        let r = (+rgb[0]).toString(16).padStart(2, '0');
        let g = (+rgb[1]).toString(16).padStart(2, '0');
        let b = (+rgb[2]).toString(16).padStart(2, '0');
        return "#" + r + g + b;
    }

    function clearSelection() {
        const selection = window.getSelection();
        if (!selection) return;

        if (selection.empty) {
            selection.empty();
        } else if (selection.removeAllRanges) {
            selection.removeAllRanges();
        }
    }

    function isColorDark(rgbColor) {
        if (!rgbColor) return false;
        if (rgbColor.startsWith('#')) {
            let r = 0, g = 0, b = 0;
            if (rgbColor.length == 4) { r = "0x" + rgbColor[1] + rgbColor[1]; g = "0x" + rgbColor[2] + rgbColor[2]; b = "0x" + rgbColor[3] + rgbColor[3]; }
            else if (rgbColor.length == 7) { r = "0x" + rgbColor[1] + rgbColor[2]; g = "0x" + rgbColor[3] + rgbColor[4]; b = "0x" + rgbColor[5] + rgbColor[6]; }
            return (0.2126 * +r + 0.7152 * +g + 0.0722 * +b) < 140;
        }
        const sep = rgbColor.indexOf(",") > -1 ? "," : " ";
        const rgb = rgbColor.substr(4).split(")")[0].split(sep);
        let r = parseInt(rgb[0], 10), g = parseInt(rgb[1], 10), b = parseInt(rgb[2], 10);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
    }

    // === LÓGICA DE INTERATIVIDADE COM INTERACT.JS ===
    function dragMoveListener(event) {
        if (isPanning) {
            slidePosX += event.dx;
            slidePosY += event.dy;
            updateSlideTransform();
            return;
        }
        
        const target = event.target;
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        const angle = parseFloat(target.getAttribute('data-angle')) || 0;
        
        // Limpa todas as linhas antes de checar por um novo alinhamento
        document.querySelectorAll('.snap-line-v, .snap-line-h').forEach(l => l.classList.remove('visible'));

        // A lógica de snap para 'is-text' foi movida para a função 'makeInteractive'.
        // Esta seção agora lida principalmente com a marca d'água e outros elementos.
        if (target.classList.contains('is-watermark')) {
            const snapThreshold = 5;
            const containerWidth = slideContainer.offsetWidth;
            const elementWidth = target.offsetWidth;
            const elementCenterX = x + (elementWidth / 2);
            const containerCenterX = containerWidth / 2;

            if (Math.abs(elementCenterX - containerCenterX) < snapThreshold) {
                x = containerCenterX - (elementWidth / 2);
                // ADICIONADO: Torna a linha de alinhamento central visível
                document.getElementById('snap-v-50').classList.add('visible');
            }
        }

        target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

    function dragEndListener() {
        document.querySelectorAll('.snap-line-v, .snap-line-h').forEach(l => l.classList.remove('visible'));
        saveState();
    }

    function resizeListener(event) {
        const target = event.target;
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.deltaRect.left;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.deltaRect.top;
        const ratio = parseFloat(target.getAttribute('data-ratio'));
        const angle = parseFloat(target.getAttribute('data-angle')) || 0;
        let newWidth = event.rect.width;
        let newHeight = event.rect.height;
        if (ratio) newHeight = newWidth / ratio;
        target.style.width = newWidth + 'px';
        target.style.height = newHeight + 'px';
        target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

    // --- FUNÇÃO makeInteractive CORRIGIDA COM HANDLE DE MOVIMENTO ---
    function makeInteractive(target) {
        if (target.classList.contains('is-text')) {
            // Para texto: usar uma "alça" (handle) para mover, liberando o elemento para seleção de texto.
            let moveHandle = target.querySelector('.move-handle');
            if (!moveHandle) {
                moveHandle = document.createElement('div');
                moveHandle.className = 'move-handle';
                target.appendChild(moveHandle);
            }

            // Ação de arrastar é aplicada SOMENTE na alça.
            interact(moveHandle).draggable({
                listeners: {
                    move(event) {
                        const targetElement = event.target.parentElement;
                        let x = (parseFloat(targetElement.getAttribute('data-x')) || 0) + event.dx;
                        let y = (parseFloat(targetElement.getAttribute('data-y')) || 0) + event.dy;
                        const angle = parseFloat(targetElement.getAttribute('data-angle')) || 0;

                        // --- LÓGICA DE SNAP RESTAURADA E MELHORADA ---
                        const snapThreshold = 5;
                        const unscaledWidth = targetElement.offsetWidth / currentScale;
                        const unscaledHeight = targetElement.offsetHeight / currentScale;
                        const elementCenterX = x + unscaledWidth / 2;
                        const elementCenterY = y + unscaledHeight / 2;

                        document.querySelectorAll('.snap-line-v, .snap-line-h').forEach(l => l.classList.remove('visible'));

                        const snapPoints = [0.25, 0.50, 0.75];
                        const containerWidth = slideContainer.offsetWidth;
                        const containerHeight = slideContainer.offsetHeight;

                        // Alinhamento Vertical (centro do elemento com linhas V do slide)
                        for (const point of snapPoints) {
                            const snapLineX = containerWidth * point;
                            if (Math.abs(elementCenterX - snapLineX) < snapThreshold) {
                                x = snapLineX - (unscaledWidth / 2); // Ajusta a posição 'x'
                                document.getElementById(`snap-v-${Math.round(point * 100)}`).classList.add('visible');
                                break;
                            }
                        }
                        
                        // Alinhamento Horizontal (centro do elemento com linhas H do slide)
                        for (const point of snapPoints) {
                            const snapLineY = containerHeight * point;
                            if (Math.abs(elementCenterY - snapLineY) < snapThreshold) {
                                y = snapLineY - (unscaledHeight / 2); // Ajusta a posição 'y'
                                document.getElementById(`snap-h-${Math.round(point * 100)}`).classList.add('visible');
                                break;
                            }
                        }
                        // --- FIM DA LÓGICA DE SNAP ---

                        targetElement.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
                        targetElement.setAttribute('data-x', x);
                        targetElement.setAttribute('data-y', y);
                    },
                    end: dragEndListener
                }
            });

            // O elemento de texto em si só terá a função de redimensionar e ser clicável.
            interact(target)
                .resizable({
                    edges: { left: true, right: true, bottom: true, top: true },
                    listeners: { move: resizeListener, end: saveState },
                    modifiers: [interact.modifiers.restrictSize({ min: { width: 50 } })]
                })
                .draggable(false) // Desativa o arrastar no contêiner de texto.
                .on('tap', setActiveElement);

            target.addEventListener('blur', saveState);

        } else {
            // Para imagens e outros elementos: comportamento original mantido.
            interact(target)
                .draggable({ listeners: { move: dragMoveListener, end: dragEndListener }, inertia: true })
                .resizable({
                    edges: { left: true, right: true, bottom: true, top: true },
                    listeners: { move: resizeListener, end: saveState },
                    modifiers: [interact.modifiers.restrictSize({ min: { width: 50 } })]
                })
                .on('tap', setActiveElement);
        }

        // Handle de rotação (funcionalidade mantida, principalmente para imagens)
        const rotationHandle = target.querySelector('.rotation-handle');
        if (rotationHandle) {
            interact(rotationHandle).draggable({
                onstart: function (event) {
                    const rect = target.getBoundingClientRect(), slideRect = slideContainer.getBoundingClientRect();
                    target.setAttribute('data-center-x', (rect.left - slideRect.left) + rect.width / 2);
                    target.setAttribute('data-center-y', (rect.top - slideRect.top) + rect.height / 2);
                },
                onmove: function (event) {
                    const centerX = parseFloat(target.getAttribute('data-center-x')), centerY = parseFloat(target.getAttribute('data-center-y'));
                    const slideRect = slideContainer.getBoundingClientRect(), clientX = event.clientX - slideRect.left, clientY = event.clientY - slideRect.top;
                    const angle = Math.atan2(clientY - centerY, clientX - centerX);
                    const x = parseFloat(target.getAttribute('data-x')) || 0, y = parseFloat(target.getAttribute('data-y')) || 0;
                    const newAngle = angle * (180 / Math.PI) + 90;
                    target.style.transform = `translate(${x}px, ${y}px) rotate(${newAngle}deg)`;
                    target.setAttribute('data-angle', newAngle);
                },
                onend: function (event) {
                    target.removeAttribute('data-center-x');
                    target.removeAttribute('data-center-y');
                    saveState();
                }
            });
        }
    }

    function setActiveElement(event) {
        if (activeElement === event.currentTarget) return;

        if (activeElement) {
            activeElement.classList.remove('selected');
        }

        activeElement = event.currentTarget;
        activeElement.classList.add('selected');

        const allElements = Array.from(slideContainer.querySelectorAll('.draggable-item'));
        const maxZIndex = allElements.reduce((max, el) => {
            const zIndex = parseInt(el.style.zIndex, 10) || 0;
            return el === activeElement ? max : Math.max(max, zIndex);
        }, 0);

        activeElement.style.zIndex = maxZIndex + 1;

        updateToolbarState();
        saveState();
    }

    // === RENDERIZAÇÃO E ESTADO ===
    function saveCurrentSlideContent() {
        if (currentSlideIndex < 0 || !allRoteiros[currentSlideIndex] || historyIndex < 0) return;
        try {
            const state = JSON.parse(history[historyIndex]);
            allRoteiros[currentSlideIndex].slideState = state.elements;
            allRoteiros[currentSlideIndex].backgroundColor = state.backgroundColor;
        } catch (e) { console.error("Error saving content from history", e); }
    }

    function createDefaultDOMElements(roteiro, textColor) {
        const firstSlideTitlePosX = 35, firstSlideTitlePosY = 80, firstSlideTitleFontSize = '20px', firstSlideTitleFontFamily = 'Cinzel';
        const titlePosX = 35, titlePosY = 40, titleFontSize = '20px', titleFontFamily = 'Aguila Bold';
        const bodyPosX = 35, bodyPosY = 120, bodyBoldColor = '#000000', bodyBoldFontFamily = 'Aguila Bold';
        if (roteiro.titulo && roteiro.titulo.trim() !== '') {
            const titleDiv = document.createElement('div');
            titleDiv.id = `element-${elementCounter++}`;
            titleDiv.className = 'draggable-item is-text';
            titleDiv.setAttribute('contenteditable', 'true');
            titleDiv.innerHTML = roteiro.titulo;
            titleDiv.style.color = textColor;
            titleDiv.style.textAlign = 'center';
            titleDiv.style.width = '250px';
            if (currentSlideIndex === 0) {
                titleDiv.style.fontFamily = firstSlideTitleFontFamily;
                titleDiv.style.fontSize = firstSlideTitleFontSize;
                titleDiv.setAttribute('data-x', firstSlideTitlePosX);
                titleDiv.setAttribute('data-y', firstSlideTitlePosY);
                titleDiv.style.transform = `translate(${firstSlideTitlePosX}px, ${firstSlideTitlePosY}px)`;
            } else {
                titleDiv.style.fontFamily = titleFontFamily;
                titleDiv.style.fontSize = titleFontSize;
                titleDiv.setAttribute('data-x', titlePosX);
                titleDiv.setAttribute('data-y', titlePosY);
                titleDiv.style.transform = `translate(${titlePosX}px, ${titlePosY}px)`;
            }
            titleDiv.querySelectorAll('b, strong').forEach(boldEl => { boldEl.style.color = textColor; });
            slideContainer.appendChild(titleDiv);
            makeInteractive(titleDiv);
        }
        if (roteiro.corpo && roteiro.corpo.trim() !== '') {
            const bodyDiv = document.createElement('div');
            bodyDiv.id = `element-${elementCounter++}`;
            bodyDiv.className = 'draggable-item is-text';
            bodyDiv.setAttribute('contenteditable', 'true');
            bodyDiv.innerHTML = roteiro.corpo;
            bodyDiv.style.fontFamily = 'Aguila';
            bodyDiv.style.fontSize = '14px';
            bodyDiv.style.color = textColor;
            bodyDiv.style.textAlign = 'justify';
            bodyDiv.style.width = '250px';
            bodyDiv.setAttribute('data-x', bodyPosX);
            bodyDiv.setAttribute('data-y', bodyPosY);
            bodyDiv.style.transform = `translate(${bodyPosX}px, ${bodyPosY}px)`;
            bodyDiv.querySelectorAll('b, strong').forEach(boldEl => {
                boldEl.style.color = bodyBoldColor;
                boldEl.style.fontFamily = bodyBoldFontFamily;
            });
            slideContainer.appendChild(bodyDiv);
            makeInteractive(bodyDiv);
        }
    }

    function loadState(elementsData) {
        elementsData.forEach(data => createElementFromState(data));
    }

    function updateWatermark() {
        let watermarkEl = slideContainer.querySelector('.is-watermark');
        if (watermarkEl) watermarkEl.remove();
        const isDark = isColorDark(slideContainer.style.backgroundColor);
        const watermarkSrc = isDark ? watermarkData.clara : watermarkData.escura;
        watermarkEl = document.createElement('div');
        watermarkEl.id = `element-${elementCounter++}`;
        watermarkEl.className = 'draggable-item is-watermark';
        const img = document.createElement('img');
        img.src = watermarkSrc;
        watermarkEl.appendChild(img);
        watermarkEl.style.width = '96px';
        watermarkEl.style.height = 'auto';
        const posX = 111, posY = 311;
        watermarkEl.setAttribute('data-x', posX);
        watermarkEl.setAttribute('data-y', posY);
        watermarkEl.style.transform = `translate(${posX}px, ${posY}px)`;
        slideContainer.appendChild(watermarkEl);
        makeInteractive(watermarkEl);
    }

    function renderSlide() {
        const roteiro = allRoteiros[currentSlideIndex];
        if (!roteiro) return;
        slideContainer.innerHTML = '';
        const snapLinesHTML = `<div class="snap-line-v" id="snap-v-25"></div><div class="snap-line-v" id="snap-v-50"></div><div class="snap-line-v" id="snap-v-75"></div><div class="snap-line-h" id="snap-h-25"></div><div class="snap-line-h" id="snap-h-50"></div><div class="snap-line-h" id="snap-h-75"></div>`;
        slideContainer.innerHTML = snapLinesHTML;
        elementCounter = 0;
        const slideGlobalIndex = allRoteiros.findIndex(r => r === roteiro);
        const isOdd = slideGlobalIndex % 2 !== 0;
        const defaultBgColor = isOdd ? colors.terracota : colors.lightGray;
        const finalBgColor = roteiro.backgroundColor || defaultBgColor;
        slideContainer.style.backgroundColor = finalBgColor;
        const textColor = isColorDark(finalBgColor) ? colors.lightGray : colors.terracota;
        if (roteiro.slideState && roteiro.slideState.length > 0) {
            loadState(roteiro.slideState);
        } else {
            createDefaultDOMElements(roteiro, textColor);
        }
        slideCounter.textContent = `${currentSlideIndex + 1} / ${allRoteiros.length}`;
        prevBtn.disabled = currentSlideIndex === 0;
        nextBtn.disabled = currentSlideIndex === allRoteiros.length - 1;
        colorPicker.value = rgbToHex(finalBgColor);
        activeElement = null;
        updateToolbarState();
        updateWatermark();
        saveState();
    }

    async function removeBgWithGoogle(imageFile) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');

        let imageSegmenter;

        try {
        // Carrega a imagem selecionada pelo usuário
            const image = new Image();
            const imageUrl = URL.createObjectURL(imageFile);
        // Espera a imagem carregar completamente em memória
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = imageUrl;
            });
            URL.revokeObjectURL(imageUrl); // Libera a memória da URL temporária

        // Cria e configura o segmentador de imagens da Google
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
            imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
                    delegate: "GPU"
                },
                outputCategoryMask: true,
                outputConfidenceMasks: false
            });

        // Processa a imagem e obtém a máscara (quais pixels são pessoa e quais são fundo)
            const result = await imageSegmenter.segment(image);
            const categoryMask = result.categoryMask.getAsFloat32Array();

        // Usa um canvas para aplicar a máscara e criar a imagem com fundo transparente
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0); // Desenha a imagem original
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;

        // Itera sobre cada pixel, deixando o fundo transparente
            for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
            // Se o valor da máscara for 0, o pixel é fundo
                if (categoryMask[j] === 0) {
                    pixels[i + 3] = 0; // Define o canal Alfa (transparência) para 0
            }
        }
            ctx.putImageData(imageData, 0, 0); // Coloca a imagem modificada de volta no canvas

        // Converte o resultado do canvas em um arquivo Blob
            return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

        } catch (error) {
            console.error('Erro ao remover o fundo com a biblioteca da Google:', error);
            alert(`Ocorreu um erro ao processar a imagem: ${error.message}`);
            return null;
        } finally {
            if (imageSegmenter) imageSegmenter.close(); // Libera a memória do modelo
        }
    }
    // --- API & DADOS ---
    async function uploadImageToCloudinary(file) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) {
                if (data.error) throw new Error(data.error.message);
                throw new Error(`Falha no upload. Status: ${response.status}`);
            }
            return data.secure_url;
        } catch (error) {
            console.error('Erro detalhado no upload:', error);
            alert(`Erro ao carregar a imagem: ${error.message}`);
            return null;
        } finally {
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
        }
    }

    async function fetchThemes() {
        const targetDropdowns = [introThemeDropdown, themeDropdown];
        targetDropdowns.forEach(d => { d.innerHTML = '<option>Carregando...</option>'; d.disabled = true; });
        try {
            const res = await fetch(`${API_BASE_URL}?action=getTemas`);
            if (!res.ok) throw new Error(`Erro de rede: ${res.status}`);
            const data = await res.json();
            if (data.status === 'success') {
                targetDropdowns.forEach(d => {
                    d.innerHTML = '<option value="" disabled selected>Selecione um tema...</option>';
                    data.data.forEach(theme => d.innerHTML += `<option value="${theme}">${theme}</option>`);
                    d.disabled = false;
                });
            } else { throw new Error('API retornou status de falha.'); }
        } catch (err) {
            console.error('Falha ao buscar temas.', err);
            targetDropdowns.forEach(d => { d.innerHTML = '<option>Erro ao carregar</option>'; });
        }
    }

    async function fetchRoteiros(tema, targetDropdown) {
        targetDropdown.innerHTML = '<option>Carregando...</option>';
        targetDropdown.disabled = true;
        try {
            const res = await fetch(`${API_BASE_URL}?action=getRoteiro&tema=${encodeURIComponent(tema)}`);
            if (!res.ok) throw new Error(`Erro de rede: ${res.status}`);
            const data = await res.json();
            if (data.status === 'success' && data.data && data.data.length > 0) {
                themeRoteiros = data.data;
                targetDropdown.innerHTML = '<option value="" disabled selected>Selecione um roteiro...</option>';
                themeRoteiros.forEach((c, i) => {
                    if (!c.title) console.warn('AVISO: Roteiro no índice', i, 'não tem um título (c.title). Roteiro:', c);
                    targetDropdown.innerHTML += `<option value="${i}">${(c.title || `Roteiro Sem Título ${i + 1}`).replace(/<[^>]*>/g, '')}</option>`;
                });
                targetDropdown.disabled = false;
                if (targetDropdown.id === 'introCarouselDropdown') confirmBtn.classList.remove('hidden');
            } else {
                targetDropdown.innerHTML = '<option>Nenhum roteiro encontrado</option>';
                if (targetDropdown.id === 'introCarouselDropdown') confirmBtn.classList.add('hidden');
            }
        } catch (err) {
            console.error('Falha CRÍTICA ao buscar roteiros.', err);
            targetDropdown.innerHTML = '<option>Erro ao carregar</option>';
        }
    }

    async function loadRoteiroByIndex(index) {
        const carouselOriginal = themeRoteiros[index];
        if (!carouselOriginal) return;
        const carrosselId = carouselOriginal.slides[0]?.carrossel_id;
        if (!carrosselId) {
            console.error("ID do carrossel não encontrado.");
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}?action=getEditedRoteiro&carrossel_id=${carrosselId}`);
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                allRoteiros = result.data;
            } else {
                allRoteiros = JSON.parse(JSON.stringify(carouselOriginal.slides));
                const firstSlide = allRoteiros[0];
                if (firstSlide && firstSlide.titulo && firstSlide.titulo.trim() !== '') {
                    const titleSlide = { ...firstSlide, corpo: '', fechamento: '' };
                    allRoteiros.unshift(titleSlide);
                    allRoteiros[1].titulo = '';
                }
                const lastSlideData = carouselOriginal.slides[carouselOriginal.slides.length - 1];
                if (lastSlideData && lastSlideData.fechamento && lastSlideData.fechamento.trim() !== '') {
                    const closingSlide = { ...lastSlideData, titulo: '', corpo: lastSlideData.fechamento };
                    allRoteiros.push(closingSlide);
                }
            }
        } catch (error) {
            console.error("Erro ao buscar roteiro editado, carregando original.", error);
            allRoteiros = JSON.parse(JSON.stringify(carouselOriginal.slides));
        }
        history = [];
        historyIndex = -1;
        currentSlideIndex = 0;
        renderSlide();
    }

    async function saveEditedRoteiro() {
        saveCurrentSlideContent();
        if (!allRoteiros || allRoteiros.length === 0) {
            alert('Não há nada para salvar.');
            return;
        }
        const saveBtnIcon = saveBtn.querySelector('i');
        saveBtnIcon.classList.remove('fa-save');
        saveBtnIcon.classList.add('fa-spinner', 'fa-spin');
        saveBtn.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}?action=salvarRoteiroEditado`, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ slides: allRoteiros })
            });
            alert('Roteiro salvo com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Ocorreu um erro ao tentar salvar o roteiro.');
        } finally {
            saveBtnIcon.classList.remove('fa-spinner', 'fa-spin');
            saveBtnIcon.classList.add('fa-save');
            saveBtn.disabled = false;
        }
    }

    // --- NAVEGAÇÃO E AÇÕES DE SLIDE ---
    function showPrevSlide() {
        saveCurrentSlideContent();
        if (currentSlideIndex > 0) {
            currentSlideIndex--;
            renderSlide();
        }
    }

    function showNextSlide() {
        saveCurrentSlideContent();
        if (currentSlideIndex < allRoteiros.length - 1) {
            currentSlideIndex++;
            renderSlide();
        }
    }

    function addNewSlide() {
        saveCurrentSlideContent();
        const currentRoteiro = allRoteiros[currentSlideIndex];
        const newSlide = {
            titulo: '', corpo: 'Novo Slide', backgroundColor: null,
            carrossel_id: currentRoteiro.carrossel_id,
            tema_geral: currentRoteiro.tema_geral,
            slideState: null
        };
        allRoteiros.splice(currentSlideIndex + 1, 0, newSlide);
        currentSlideIndex++;
        renderSlide();
        saveState();
    }

    function removeCurrentSlide() {
        if (allRoteiros.length <= 1) {
            alert('Não é possível remover o único slide.');
            return;
        }
        if (confirm('Tem certeza que deseja remover este slide?')) {
            allRoteiros.splice(currentSlideIndex, 1);
            if (currentSlideIndex >= allRoteiros.length) {
                currentSlideIndex = allRoteiros.length - 1;
            }
            renderSlide();
            saveState();
        }
    }

    // --- FERRAMENTAS DO EDITOR ---
    function updateToolbarState() {
        const textControls = [boldBtn, italicBtn, underlineBtn, leftAlignBtn, centerAlignBtn, rightAlignBtn, justifyBtn, fontFamilySelect, fontSizeSelect, textColorPicker, lineHeightSelect];
        const generalControls = [deleteBtn, bringToFrontBtn, sendToBackBtn, opacitySlider];
        [...textControls, ...generalControls].forEach(control => control && (control.disabled = !activeElement));
        if (resetZoomBtn) resetZoomBtn.disabled = false;
        if (!activeElement) {
            textControls.forEach(control => control && control.classList.remove('active'));
            return;
        }
        if (!activeElement.classList.contains('is-text')) {
            textControls.forEach(control => control.disabled = true);
            return;
        }
        setTimeout(() => {
            boldBtn.classList.toggle('active', document.queryCommandState('bold'));
            italicBtn.classList.toggle('active', document.queryCommandState('italic'));
            underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
            const styles = window.getComputedStyle(activeElement);
            leftAlignBtn.classList.toggle('active', styles.textAlign === 'left' || styles.textAlign === 'start');
            centerAlignBtn.classList.toggle('active', styles.textAlign === 'center');
            rightAlignBtn.classList.toggle('active', styles.textAlign === 'right' || styles.textAlign === 'end');
            justifyBtn.classList.toggle('active', styles.textAlign === 'justify');
            const selectionFont = document.queryCommandValue('fontName').replace(/['"]/g, '');
            fontFamilySelect.value = selectionFont || styles.fontFamily.replace(/['"]/g, '');
            fontSizeSelect.value = parseInt(styles.fontSize, 10);
            const computedLineHeight = styles.lineHeight;
            if (computedLineHeight === 'normal') {
                lineHeightSelect.value = '1.2';
            } else {
                const lineHeightValue = parseFloat(computedLineHeight);
                const fontSizeValue = parseFloat(styles.fontSize);
                if (fontSizeValue > 0) {
                    const finalRatio = (lineHeightValue / fontSizeValue).toFixed(1);
                    lineHeightSelect.value = finalRatio;
                }
            }
            const selectionColor = document.queryCommandValue('foreColor');
            textColorPicker.value = rgbToHex(selectionColor);
            opacitySlider.value = styles.opacity;
        }, 10);
    }

    function applyFormat(command) {
        if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
            document.execCommand(command, false, null);
            activeElement.focus();
            saveState();
            updateToolbarState();
        }
    }

    function setStyle(property, value) {
        if (activeElement) {
            activeElement.style[property] = value;
            saveState();
            updateToolbarState();
        }
    }

    function addNewTextBox() {
        const newText = document.createElement('div');
        newText.id = `element-${elementCounter++}`;
        newText.className = 'draggable-item is-text';
        newText.setAttribute('contenteditable', 'true');
        newText.innerHTML = "Novo Texto";
        newText.style.width = '280px';
        newText.style.height = '80px';
        newText.style.fontFamily = 'Aguila';
        newText.style.fontSize = '16px';
        const posX = 20, posY = 50;
        newText.setAttribute('data-x', posX);
        newText.setAttribute('data-y', posY);
        newText.style.transform = `translate(${posX}px, ${posY}px)`;
        slideContainer.appendChild(newText);
        makeInteractive(newText);
        setActiveElement({ currentTarget: newText });
        saveState();
    }

    function exportSlideAsPNG() {
        if (activeElement) {
            activeElement.classList.remove('selected');
            activeElement = null;
        }
        html2canvas(slideContainer, { scale: 4, useCORS: true, backgroundColor: null }).then(canvas => {
            const link = document.createElement('a');
            link.download = `slide_${currentSlideIndex + 1}_exportado.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }

    // === SETUP DE EVENTOS DO DOM ===
    function setupEventListeners() {
        const addSafeListener = (el, event, handler) => {
            if (el) el.addEventListener(event, handler);
        };

        // Listener para o botão de upload normal
        addSafeListener(uploadBtn, 'click', () => {
            shouldRemoveBackground = false; // Define o modo para "não remover"
            imageUpload.click(); // Aciona o seletor de arquivo
        });

        // Listener para o botão de upload COM remoção de fundo
        addSafeListener(uploadAndRemoveBgBtn, 'click', () => {
            shouldRemoveBackground = true; // Define o modo para "remover"
            imageUpload.click(); // Aciona o seletor de arquivo
        });

        // Listener principal que executa a ação DEPOIS que o usuário seleciona um arquivo
        addSafeListener(imageUpload, 'change', async (e) => {
            const originalFile = e.target.files?.[0];
            if (!originalFile) return;

            let fileToUpload = originalFile;

            // Se o modo "remover fundo" foi ativado, processa a imagem primeiro
            if (shouldRemoveBackground) {
                const imageBlob = await removeBgWithGoogle(originalFile);
                if (imageBlob) {
                    fileToUpload = new File([imageBlob], originalFile.name, { type: imageBlob.type });
                }
            }
            
            const imageUrl = await uploadImageToCloudinary(fileToUpload);
            
            e.target.value = '';
            if (!imageUrl) return;

            const tempImg = new Image();
            tempImg.onload = () => {
                const ratio = tempImg.naturalWidth / tempImg.naturalHeight;
                const initialWidth = 150;
                const imgContainer = document.createElement('div');
                imgContainer.id = `element-${elementCounter++}`;
                imgContainer.className = 'draggable-item is-image';
                const img = document.createElement('img');
                img.src = imageUrl;
                imgContainer.appendChild(img);
                const handle = document.createElement('div');
                handle.className = 'rotation-handle';
                imgContainer.appendChild(handle);
                imgContainer.style.width = initialWidth + 'px';
                imgContainer.style.height = (initialWidth / ratio) + 'px';
                imgContainer.setAttribute('data-ratio', ratio);
                imgContainer.setAttribute('data-x', '50');
                imgContainer.setAttribute('data-y', '50');
                imgContainer.style.transform = 'translate(50px, 50px)';
                slideContainer.appendChild(imgContainer);
                makeInteractive(imgContainer);
                saveState();
            };
            tempImg.src = imageUrl;
        });

        addSafeListener(introThemeDropdown, 'change', e => { confirmBtn.classList.add('hidden'); fetchRoteiros(e.target.value, introCarouselDropdown); });
        addSafeListener(introCarouselDropdown, 'change', () => { /* Apenas para o CSS :valid funcionar */ });
        addSafeListener(confirmBtn, 'click', () => {
            const idx = parseInt(introCarouselDropdown.value, 10);
            if (!isNaN(idx) && themeRoteiros[idx]) {
                themeDropdown.value = introThemeDropdown.value;
                carouselDropdown.innerHTML = introCarouselDropdown.innerHTML;
                carouselDropdown.value = introCarouselDropdown.value;
                topBarsWrapper.classList.remove('hidden');
                mainElement.classList.remove('hidden');
                introScreen.classList.add('hidden');
                loadRoteiroByIndex(idx);
            }
        });

        addSafeListener(themeDropdown, 'change', e => fetchRoteiros(e.target.value, carouselDropdown));
        addSafeListener(carouselDropdown, 'change', e => loadRoteiroByIndex(parseInt(e.target.value, 10)));
        addSafeListener(prevBtn, 'click', showPrevSlide);
        addSafeListener(nextBtn, 'click', showNextSlide);
        addSafeListener(addSlideBtn, 'click', addNewSlide);
        addSafeListener(removeSlideBtn, 'click', removeCurrentSlide);
        addSafeListener(exportPngBtn, 'click', exportSlideAsPNG);
        addSafeListener(saveBtn, 'click', saveEditedRoteiro);
        addSafeListener(addTextBtn, 'click', addNewTextBox);
        addSafeListener(boldBtn, 'click', () => applyFormat('bold'));
        addSafeListener(italicBtn, 'click', () => applyFormat('italic'));
        addSafeListener(underlineBtn, 'click', () => applyFormat('underline'));

        const styleAndSave = (prop, val) => { setStyle(prop, val); };
        addSafeListener(leftAlignBtn, 'click', () => styleAndSave('textAlign', 'left'));
        addSafeListener(centerAlignBtn, 'click', () => styleAndSave('textAlign', 'center'));
        addSafeListener(rightAlignBtn, 'click', () => styleAndSave('textAlign', 'right'));
        addSafeListener(justifyBtn, 'click', () => styleAndSave('textAlign', 'justify'));
        addSafeListener(fontFamilySelect, 'change', e => styleAndSave('fontFamily', e.target.value));
        addSafeListener(fontSizeSelect, 'change', e => styleAndSave('fontSize', e.target.value + 'px'));
        addSafeListener(lineHeightSelect, 'change', e => styleAndSave('lineHeight', e.target.value));
        addSafeListener(textColorPicker, 'input', e => {
            if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
                activeElement.focus();
                document.execCommand('foreColor', false, e.target.value);
                saveState();
            }
        });
        addSafeListener(opacitySlider, 'input', e => styleAndSave('opacity', e.target.value));

        const layerAndSave = (action) => {
            if (activeElement) {
                action();
                saveState();
            }
        };
        addSafeListener(bringToFrontBtn, 'click', () => layerAndSave(() => {
            const zIndexes = Array.from(slideContainer.querySelectorAll('.draggable-item:not(.selected)')).map(el => parseInt(el.style.zIndex, 10) || 0);
            const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
            activeElement.style.zIndex = maxZ + 1;
        }));
        addSafeListener(sendToBackBtn, 'click', () => layerAndSave(() => {
            const otherElements = slideContainer.querySelectorAll('.draggable-item:not(.selected)');
            otherElements.forEach(el => {
                const currentZ = parseInt(el.style.zIndex, 10) || 0;
                el.style.zIndex = currentZ + 1;
            });
            activeElement.style.zIndex = 0;
        }));
        addSafeListener(deleteBtn, 'click', () => {
            if (activeElement) {
                const prevActive = activeElement;
                activeElement = null;
                updateToolbarState();
                prevActive.remove();
                saveState();
            }
        });
        const colorActionAndSave = (e) => {
            const color = e.currentTarget.dataset.color;
            colorPicker.value = color;
            slideContainer.style.backgroundColor = color;
            updateWatermark();
            saveState();
        };
        addSafeListener(colorPicker, 'input', e => {
            slideContainer.style.backgroundColor = e.target.value;
            updateWatermark();
            saveState();
        });
        document.querySelectorAll('.color-shortcut').forEach(btn => { addSafeListener(btn, 'click', colorActionAndSave); });
        document.querySelectorAll('.text-color-shortcut').forEach(btn => {
            addSafeListener(btn, 'click', e => {
                const color = e.currentTarget.dataset.color;
                textColorPicker.value = color;
                if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
                    activeElement.focus();
                    document.execCommand('foreColor', false, color);
                    saveState();
                }
            });
        });
        addSafeListener(document, 'selectionchange', () => {
            if (document.activeElement && document.activeElement.getAttribute('contenteditable')) {
                setActiveElement({ currentTarget: document.activeElement });
            }
        });

        addSafeListener(document, 'copy', handleCopy);
        addSafeListener(document, 'paste', handlePasteFromEvent);

        document.addEventListener('click', function (e) {
            const isClickInsideSlide = slideContainer.contains(e.target);
            const isClickOnToolbar = e.target.closest('.editor-toolbar');
            const isClickOnHeader = e.target.closest('.main-header-bar');
            
            if (!isClickInsideSlide && !isClickOnToolbar && !isClickOnHeader) {
                if (activeElement) {
                    activeElement.classList.remove('selected');
                    activeElement = null;
                    updateToolbarState();
                }
            }
        });

        const zoomPanContainer = document.getElementById('zoom-pan-container');
        addSafeListener(zoomPanContainer, 'wheel', (event) => {
            event.preventDefault();
            const rect = zoomPanContainer.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const zoomIntensity = 0.05;
            const wheel = event.deltaY < 0 ? 1 : -1;
            const scrollZoomFactor = Math.exp(wheel * zoomIntensity);
            const minScale = 1, maxScale = 5;
            const prevSlidePosX = slidePosX, prevSlidePosY = slidePosY;
            const oldScale = currentScale;
            currentScale = Math.max(minScale, Math.min(maxScale, oldScale * scrollZoomFactor));
            if (currentScale === 1) {
                slidePosX = 0;
                slidePosY = 0;
            } else {
                const actualZoomFactor = currentScale / oldScale;
                slidePosX = mouseX - (mouseX - prevSlidePosX) * actualZoomFactor;
                slidePosY = mouseY - (mouseY - prevSlidePosY) * actualZoomFactor;
            }
            updateSlideTransform();
        });
        interact(zoomPanContainer).draggable({
            onstart: function () {
                if (currentScale > 1) {
                    document.body.classList.add('is-panning');
                }
            },
            onmove: function (event) {
                if (currentScale > 1) {
                    slidePosX += event.dx;
                    slidePosY += event.dy;
                    updateSlideTransform();
                }
            },
            onend: function () {
                document.body.classList.remove('is-panning');
            }
        });
        addSafeListener(resetZoomBtn, 'click', () => {
            currentScale = 1;
            slidePosX = 0;
            slidePosY = 0;
            updateSlideTransform();
        });

        addSafeListener(document, 'keydown', (event) => {
            const isTyping = document.activeElement.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

            if ((event.ctrlKey || event.metaKey) && !isTyping) {
                let handled = false;
                switch (event.key.toLowerCase()) {
                    case 'z': undo(); handled = true; break;
                    case 'y': redo(); handled = true; break;
                }
                if (handled) {
                    event.preventDefault();
                    return;
                }
            }
            
            if (event.key.toLowerCase() === 'delete' || event.key.toLowerCase() === 'backspace') {
                if(activeElement && !isTyping) {
                    event.preventDefault();
                    deleteBtn.click();
                }
            }

            if (event.code === 'Space' && !isTyping) {
                event.preventDefault();
                if (!isPanning) {
                    isPanning = true;
                    document.body.classList.add('is-panning');
                }
                return;
            }

            if (isTyping) return;

            switch (event.key) {
                case 'ArrowLeft':
                    if (!prevBtn.disabled) showPrevSlide();
                    break;
                case 'ArrowRight':
                    if (!nextBtn.disabled) showNextSlide();
                    break;
            }
        });
        addSafeListener(document, 'keyup', (event) => {
            if (event.code === 'Space') {
                isPanning = false;
                document.body.classList.remove('is-panning');
            }
        });
    }

    // --- INICIALIZAÇÃO DA APLICAÇÃO ---
    setupEventListeners();
    fetchThemes();
});
