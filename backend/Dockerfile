FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY demafur ./demafur
COPY worker.py demo.py ./
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
USER app
ENV DEMAFUR_DB=/data/demafur.sqlite3
EXPOSE 8000
CMD ["uvicorn", "demafur.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
