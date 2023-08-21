import * as puppeteer from 'puppeteer';

type GithubData = {
    projects: {
        projectName: string | null;
        projectDescription: string | null;
        programmingLanguage: string | null;
        lastUpdated: string | null;
    }[];
    name: string | null;
    username: string | null;
    description: string | null;
    contributionsLastYear: string | null;
}

async function scrapeGithubProfile(url: string): Promise<GithubData | null> {

    if (!url.startsWith('https://github.com/')) {
        return null
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url);

    // Extract basic profile details
    const profileData: { name: string | null, username: string | null, description: string | null, contributionsLastYear: string | null } = await page.evaluate(() => {
        const name: string | null = document.querySelector<HTMLElement>('.p-name')?.innerText || null
        const username: string | null = document.querySelector<HTMLElement>('.p-nickname')?.innerText || null
        const description: string | null = document.querySelector<HTMLElement>('.p-note')?.innerText || null
        //@ts-ignore
        const contributionsLastYear: string | null = document.getElementsByClassName('js-yearly-contributions')[0].children[0].children[0].innerText || null;

        return { name, username, description, contributionsLastYear };
    });

    // Navigate to repositories page
    await page.goto(`${url}?tab=repositories`);

    // Extract repository details
    const projectsData = await page.evaluate(() => {
        const projectElements = document.querySelectorAll('.col-12.d-flex.flex-justify-between.width-full.py-4.border-bottom.color-border-muted.public.source');
        const projects: {
            projectName: string | null,
            projectDescription: string | null,
            programmingLanguage: string | null,
            lastUpdated: string | null
        }[] = [];

        [...projectElements.values()].slice(0, 5).forEach(element => {
            let projectName: string | null = element.querySelector<HTMLElement>('a[itemprop="name codeRepository"]')?.innerText.trim() || null;
            let projectDescription: string | null = element.querySelector<HTMLElement>('p[itemprop="description"]')?.innerText.trim() || null;
            let programmingLanguage: string | null = element.querySelector<HTMLElement>('span[itemprop="programmingLanguage"]')?.innerText.trim() || null;
            let lastUpdated: string | null = element.querySelector('relative-time')?.getAttribute('title') || null;

            projects.push({
                projectName,
                projectDescription,
                programmingLanguage,
                lastUpdated
            });
        });

        return projects;
    });

    const finalData = {
        ...profileData,
        projects: projectsData
    };

    await browser.close();

    return finalData;
}

export { scrapeGithubProfile, GithubData }