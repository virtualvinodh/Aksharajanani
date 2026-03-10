const chars = '൘൙൛൜൝൞൰൱൲൳൴൵൶൷൸൹൏';
for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const code = char.charCodeAt(0);
    console.log(`  { "unicode": ${code}, "name": "${char}", "glyphClass": "base" },`);
}
