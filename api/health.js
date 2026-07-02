export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    claude: !!process.env.ANTHROPIC_API_KEY,
    hunter: !!process.env.HUNTER_KEY,
    lusha: !!process.env.LUSHA_KEY
  });
}
