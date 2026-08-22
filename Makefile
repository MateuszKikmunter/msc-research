.PHONY: start start-backend start-frontend execute gold test-experiments typecheck-experiments

MODEL ?= nova-lite
REPETITION ?= 1

start:
	npm start

start-backend:
	npm run start:backend

start-frontend:
	npm run start:frontend

execute:
	MODEL_CONDITION=$(MODEL) REPETITION=$(REPETITION) npm --prefix src/experiments run execute

gold:
	npm --prefix src/experiments run gold

test-experiments:
	npm --prefix src/experiments test

typecheck-experiments:
	npm --prefix src/experiments run typecheck
