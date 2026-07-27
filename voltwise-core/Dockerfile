FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml .
COPY voltwise-core/pom.xml voltwise-core/pom.xml
COPY voltwise-sensors/pom.xml voltwise-sensors/pom.xml
COPY voltwise-core/src voltwise-core/src
RUN mvn -pl voltwise-core -am -DskipTests package
FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/voltwise-core/target/voltwise-core-1.0.0.jar app.jar
COPY voltwise-core/render-entrypoint.sh /app/render-entrypoint.sh
RUN chmod +x /app/render-entrypoint.sh
ENTRYPOINT ["/app/render-entrypoint.sh"]
