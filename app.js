(function () {
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = 'style.css';
    document.head.appendChild(linkElement);

    fetch('data.json')
        .then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(data => createPage(data))
        .catch(error => {
            console.error('Ошибка при загрузке data.json:', error);
            const message = document.createElement('p');
            message.setAttribute('role', 'alert');
            message.textContent = 'Не удалось загрузить страницу. Обновите её или попробуйте позже. Для локального запуска используйте HTTP-сервер.';
            document.body.appendChild(message);
        });

    function createPage(data) {
        document.title = data.shortTitle;

        const widgetScript = document.createElement('script');
        widgetScript.src = 'widget/app.js';
        widgetScript.charset = 'utf-8';
        document.head.appendChild(widgetScript);

        const page = document.createElement('div');
        page.className = 'page';
        document.body.appendChild(page);

        const h1 = document.createElement('h1');
        h1.className = 'widget-title';
        h1.textContent = data.title;
        page.appendChild(h1);

        const imageSection = document.createElement('section');
        imageSection.className = 'widget-image-section';
        page.appendChild(imageSection);

        const img = document.createElement('img');
        img.className = 'widget-image';
        img.src = data.image;
        img.alt = data.shortTitle;
        imageSection.appendChild(img);

        const descSection = document.createElement('section');
        descSection.className = 'widget-description';
        page.appendChild(descSection);

        const descHeader = document.createElement('h2');
        descHeader.textContent = data.sectionTitles.description;
        descSection.appendChild(descHeader);

        data.description.forEach(function (paragraphText) {
            const p = document.createElement('p');
            p.className = 'widget-description-paragraph';
            p.textContent = paragraphText;
            descSection.appendChild(p);
        });

        const storiesSection = document.createElement('section');
        storiesSection.className = 'widget-stories';
        page.appendChild(storiesSection);

        addStoriesBlock(
            storiesSection,
            data.sectionTitles.visitorStories,
            data.stories.visitor,
            'visitor-stories'
        );

        addStoriesBlock(
            storiesSection,
            data.sectionTitles.adminStories,
            data.stories.admin,
            'admin-stories'
        );

        addStoriesBlock(
            storiesSection,
            data.sectionTitles.developerStories,
            data.stories.developer,
            'developer-stories'
        );

        addWidgetsSection(page);
    }

    function addStoriesBlock(parent, titleText, storiesArray, blockClass) {
        const block = document.createElement('section');
        block.className = 'stories-block ' + blockClass;
        parent.appendChild(block);

        const h2 = document.createElement('h2');
        h2.className = 'stories-title';
        h2.textContent = titleText;
        block.appendChild(h2);

        const list = document.createElement('ol');
        list.className = 'stories-list';
        block.appendChild(list);

        storiesArray.forEach(function (story) {
            const item = document.createElement('li');
            item.className = 'story-item';

            const p = document.createElement('p');
            p.textContent = story.text;

            item.appendChild(p);
            list.appendChild(item);
        });
    }

    function addWidgetsSection(parent) {
        const section = document.createElement('section');
        section.className = 'widget-demo-section';
        parent.appendChild(section);
    
        const title = document.createElement('h2');
        title.className = 'stories-title';
        title.textContent = 'Примеры работающего виджета';
        section.appendChild(title);
    
        const list = document.createElement('div');
        list.className = 'widget-demo-list';
        section.appendChild(list);
    
        const widget1 = document.createElement('mental-math-widget');
        widget1.id = 'mental-math-1';
        widget1.setAttribute('data-level', 'easy');
        widget1.setAttribute('data-duration', '60');
        list.appendChild(widget1);
    
        const widget2 = document.createElement('mental-math-widget');
        widget2.id = 'mental-math-2';
        widget2.setAttribute('data-level', 'medium');
        widget2.setAttribute('data-duration', '45');
        list.appendChild(widget2);
    
        const widget3 = document.createElement('mental-math-widget');
        widget3.id = 'mental-math-3';
        widget3.setAttribute('data-level', 'hard');
        widget3.setAttribute('data-duration', '30');
        list.appendChild(widget3);
    }
})();