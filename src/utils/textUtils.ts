export const formatLogFooter = (content: string): string => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());

    // Using string length as a proxy for word count (or character count which is more common in CN context "字数")
    const count = content.length;

    // Format: log：$(YYYY)$(month_mm)$(day_dd)$(hh)$(mm)，{字数}
    return `\n\nlog：${yyyy}${mm}${dd}${hh}${min}，${count}`;
};
