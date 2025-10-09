document.addEventListener("DOMContentLoaded", () => {
    const audio = document.getElementById("bg-audio");
    
    // Forçar o som em dispositivos que bloqueiam autoplay
    const tryPlay = () => {
        audio.play().catch(() => {
            document.body.addEventListener("click", () => {
                audio.play();
            }, { once: true });
        });
    };

    tryPlay();
});
