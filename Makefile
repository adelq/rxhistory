.PHONY: js

js: js/FileSaver.min.js js/moment.min.js js/xlsx.full.min.js

js/FileSaver.min.js:
	wget "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.3/FileSaver.min.js" -P js

js/moment.min.js:
	wget "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.19.1/moment.min.js" -P js

js/xlsx.full.min.js:
	wget "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.11.6/xlsx.full.min.js" -P js
