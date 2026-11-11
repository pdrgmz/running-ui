with open('src/app/features/dashboard/widgets/training-panel/training-panel.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

open_article = 0
close_article = 0
open_div_grid = 0
close_div_grid = 0
open_section = 0
close_section = 0

for i, line in enumerate(lines, 1):
    if '<article' in line and 'class=' in line:
        open_article += 1
        print(f'L{i}: OPEN article: {line.strip()[:80]}')
    if line.strip() == '</article>':
        close_article += 1
        print(f'L{i}: CLOSE article')
    if 'training-management-grid' in line and '<div' in line:
        open_div_grid += 1
        print(f'L{i}: OPEN div grid: {line.strip()[:80]}')
    if line.strip() == '</div>' and open_div_grid > close_div_grid:
        close_div_grid += 1
        print(f'L{i}: CLOSE div (possible grid)')
    if '<section' in line and 'class=' in line:
        open_section += 1
        print(f'L{i}: OPEN section: {line.strip()[:80]}')
    if line.strip() == '</section>':
        close_section += 1
        print(f'L{i}: CLOSE section')

print(f'\nTotals: article open={open_article} close={close_article}')
print(f'div grid open={open_div_grid} close={close_div_grid}')
print(f'section open={open_section} close={close_section}')
