.PHONY: start start-backend start-frontend gold test-experiments typecheck-experiments

start:
	npm start

start-backend:
	npm run start:backend

start-frontend:
	npm run start:frontend

gold:
	npm --prefix src/experiments run gold

test-experiments:
	npm --prefix src/experiments test

typecheck-experiments:
	npm --prefix src/experiments run typecheck
