// ==UserScript==
// @name         Yandex Maps Hammer PRO (Final)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Исправлена ошибка eslint и улучшен drag-and-drop
// @author       Gemini
// @match        https://yandex.ru/maps/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let currentGrid = 16;
    const METERS_TO_UNITS = 39.37;

    // --- СОЗДАНИЕ МЕНЮ ---
    const panel = document.createElement('div');
    panel.style = `
        position: fixed; top: 100px; left: 10px; z-index: 10000;
        background: #2a2a2a; color: #57ff68; padding: 5px;
        border-radius: 8px; border: 1px solid #57ff68;
        font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        user-select: none; touch-action: none; cursor: move; width: 100px;
    `;
    
    panel.innerHTML = `
        <div style="font-size: 9px; color: #888; text-align: center; margin-bottom: 5px;">⋮⋮ HAMMER GRID ⋮⋮</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;" id="hammer-btns"></div>
    `;
    document.body.appendChild(panel);

    const btnContainer = panel.querySelector('#hammer-btns');
    [16, 32, 64, 128].forEach(size => {
        const btn = document.createElement('button');
        btn.innerText = size;
        btn.style = `
            background: ${size === currentGrid ? '#57ff68' : '#444'};
            color: ${size === currentGrid ? '#000' : '#ccc'};
            border: none; padding: 5px; cursor: pointer; border-radius: 4px; font-size: 11px; font-weight: bold;
        `;
        // Исправленная функция клика (без return assignment)
        btn.onclick = (e) => {
            e.stopPropagation();
            currentGrid = size;
            updateUI();
        };
        btnContainer.appendChild(btn);
    });

    function updateUI() {
        const btns = btnContainer.querySelectorAll('button');
        btns.forEach(b => {
            const active = parseInt(b.innerText) === currentGrid;
            b.style.background = active ? '#57ff68' : '#444';
            b.style.color = active ? '#000' : '#ccc';
        });
        processRuler();
    }

    // --- DRAG & DROP БЕЗ ОШИБОК ---
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    panel.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return; // Не тащим, если нажали на кнопку
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
    };

    window.onmousemove = (e) => {
        if (isDragging) {
            panel.style.left = (e.clientX - offsetX) + 'px';
            panel.style.top = (e.clientY - offsetY) + 'px';
        }
    };

    window.onmouseup = () => {
        isDragging = false;
    };

    // --- РАСЧЕТ ЮНИТОВ ---
    function processRuler() {
        const labels = document.querySelectorAll('.ruler-balloon__label');
        labels.forEach(label => {
            // Берем только текстовый узел (расстояние), игнорируя наши вложенные блоки
            const text = label.childNodes[0] ? label.childNodes[0].textContent : "";
            const match = text.match(/([\d,\.]+)\s*(м|км)/);
            
            if (match) {
                let value = parseFloat(match[1].replace(',', '.').replace(/\s/g, ''));
                if (match[2] === 'км') value *= 1000;

                const snapped = Math.round((value * METERS_TO_UNITS) / currentGrid) * currentGrid;

                let resSpan = label.querySelector('.hammer-val');
                if (!resSpan) {
                    resSpan = document.createElement('div');
                    resSpan.className = 'hammer-val';
                    resSpan.style = "color: #57ff68; font-weight: bold; border-top: 1px solid #555; margin-top: 2px; font-size: 12px;";
                    label.appendChild(resSpan);
                }
                
                const displayVal = snapped + " u";
                if (resSpan.innerText !== displayVal) {
                    resSpan.innerText = displayVal;
                }
            }
        });
    }

    // Стабильный интервал без перегрузки
    setInterval(processRuler, 500);

})();