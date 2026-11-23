NPM := npm --prefix web

.DEFAULT_GOAL := help

.PHONY: help install dev check test e2e up down logs ps

help:
	@echo Lệnh có sẵn:
	@echo   make install   Cài thư viện cho web
	@echo   make dev       Chạy web bằng Vite ở http://localhost:5173, API do mock MSW trả lời
	@echo   make check     Lint, kiểm tra kiểu, unit test, build
	@echo   make test      Chạy unit test
	@echo   make e2e       Chạy test Playwright
	@echo   make up        Build và chạy web bằng Docker ở http://localhost:3000
	@echo   make down      Dừng và xóa container Docker
	@echo   make logs      Xem log của web trong Docker
	@echo   make ps        Xem trạng thái container Docker

web/node_modules:
	$(NPM) install

install:
	$(NPM) install

dev: | web/node_modules
	$(NPM) run dev

check: | web/node_modules
	$(NPM) run check

test: | web/node_modules
	$(NPM) run test

e2e: | web/node_modules
	$(NPM) run e2e

up:
	docker compose up -d --build
	@echo Web: http://localhost:3000

down:
	docker compose down

logs:
	docker compose logs -f web

ps:
	docker compose ps
