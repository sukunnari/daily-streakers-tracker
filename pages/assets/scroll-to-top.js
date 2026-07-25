const scrollButton = document.querySelector("button.scroll-to-top");

if (scrollButton) {
	window.addEventListener("scroll", () => {
		if (window.scrollY > 500) {
			scrollButton.classList.add("visible");
		} else {
			scrollButton.classList.remove("visible");
		}
	});

	scrollButton.addEventListener("click", () => {
		window.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	});
}
