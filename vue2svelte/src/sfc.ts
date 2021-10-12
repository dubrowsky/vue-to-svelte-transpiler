
const parseAttrs = (attrs: string) => {
    if (!attrs) {
        return {};
    }
    const parts = attrs.match(/([a-z0-9]+)(?:\s*=[\s"']*([^\s"']+))?/ig);
    return (parts || []).reduce(
        (res: Record<string, string | boolean>, p) => {
            const kv = p.split('=');
            if (kv.length === 1) {
                res[p] = true;
            } else {
                const [k, v] = kv;
                res[k.trim()] = v.replace(/^['"\s]+|['"\s]+$/g, '');
            }
            return res;
        },
        {},
    );
}

export const parseSfc = (src: string) => {
    const [template, script, style] = ['template','script','style'].map(
        prop => {
            const res = src.match(new RegExp(`<${prop}([^>]*?)>(.+)</${prop}>`, 'is'));
            if (!res) {
                return { content: '', attrs: {} };
            }
            const content = res[2];
            const attrs = res[1];
            return { content, attrs: parseAttrs(attrs) };
        }
    )
    return {
        template,
        script,
        style,
    }
};
